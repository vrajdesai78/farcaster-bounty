import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

ROOT=Path(__file__).resolve().parents[1]
from farcaster_cli import local

class LocalNodeTests(unittest.TestCase):
    def test_hardware_boundaries(self):
        good={'Architecture':'x86_64','OSType':'linux','NCPU':4,'MemTotal':16_000_000_000}
        local.requirements(good,2_000_000_000_000)
        for change,free in [({'Architecture':'aarch64'},3_000_000_000_000),({'OSType':'windows'},3_000_000_000_000),({'NCPU':3},3_000_000_000_000),({'MemTotal':8_000_000_000},3_000_000_000_000),({},1_999_999_999_999)]:
            with self.assertRaises(RuntimeError):local.requirements(dict(good,**change),free)
    def test_remote_docker_context_refused_without_creating_files(self):
        with patch.object(local,'run',return_value='ssh://remote'),patch.object(local.DIRECTORY.__class__,'mkdir') as mkdir:
            with self.assertRaises(RuntimeError):local.prepare()
            mkdir.assert_not_called()
    def test_unsupported_compose_refused_before_docker_info(self):
        with patch.object(local,'run',side_effect=['unix:///run/docker.sock','2.23.0']) as run:
            with self.assertRaises(RuntimeError):local.check()
            self.assertEqual(run.call_count,2)
    def test_capacity_checks_only_read_local_docker_and_disk(self):
        import json
        good={'Architecture':'x86_64','OSType':'linux','NCPU':4,'MemTotal':16_000_000_000}
        with patch.object(local,'run',side_effect=['unix:///run/docker.sock','2.24.4',json.dumps(good)]) as run,patch.object(local.shutil,'disk_usage',return_value=SimpleNamespace(free=2_000_000_000_000)):
            local.check()
            self.assertTrue(all(call.args[0][0]=='docker' for call in run.call_args_list))
    def test_local_stop_targets_only_named_project_and_retains_data(self):
        with tempfile.TemporaryDirectory() as name:
            directory=Path(name);(directory/'.local-node-owner').write_text('farcaster-local-node-v1\n')
            with patch.object(local,'DIRECTORY',directory),patch.object(local,'run') as run:
                local.compose('down')
                cmd=run.call_args.args[0]
                self.assertEqual(cmd[:4],['docker','compose','-p','farcaster-local'])
                self.assertNotIn('--volumes',cmd);self.assertEqual(cmd[-1],'down')
                self.assertTrue(directory.exists())
    def test_local_status_requires_every_shard_and_real_read(self):
        from io import BytesIO
        import json
        first={'shardInfos':[{'shardId':0,'maxHeight':10,'blockDelay':1},{'shardId':1,'maxHeight':20,'blockDelay':2}]}
        second={'shardInfos':[{'shardId':0,'maxHeight':11,'blockDelay':1},{'shardId':1,'maxHeight':21,'blockDelay':2}]}
        with tempfile.TemporaryDirectory() as name,patch.object(local,'DIRECTORY',Path(name)),patch.object(local.time,'sleep'),patch.object(local.urllib.request,'urlopen',side_effect=[BytesIO(json.dumps(x).encode()) for x in [first,second,{'messages':[{'hash':'0xfixture'}]}]]) as fetch:
            local.verify();self.assertTrue((Path(name)/'sync-evidence.json').exists())
            self.assertTrue(all(call.args[0].startswith('http://127.0.0.1:3381/') for call in fetch.call_args_list))

    def test_client_uses_direct_local_node_without_aws_or_ssh(self):
        with tempfile.TemporaryDirectory() as name:
            root=Path(name);(root/'client/node_modules').mkdir(parents=True);(root/'.local-node-owner').write_text('farcaster-local-node-v1')
            with patch.object(local,'ROOT',root),patch.object(local,'DIRECTORY',root),patch.object(local.socket,'socket'),patch.object(local,'run',side_effect=['24.0.0','']) as run:
                local.client()
                self.assertEqual([c.args[0][0] for c in run.call_args_list],['node','npm'])
                self.assertEqual(run.call_args.kwargs['env']['SNAPCHAIN_URL'],'http://127.0.0.1:3381')
