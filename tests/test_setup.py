import importlib.util
from importlib.machinery import SourceFileLoader
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
loader = SourceFileLoader('relay_cli', str(ROOT / 'relay'))
spec = importlib.util.spec_from_loader(loader.name, loader)
relay = importlib.util.module_from_spec(spec)
loader.exec_module(relay)

class SetupTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.directory = Path(self.tmp.name)
        self.patches = [patch.object(relay, 'STATE_DIR', self.directory), patch.object(relay, 'STATE_FILE', self.directory / 'state.json'), patch.object(relay, 'require')]
        for p in self.patches: p.start()
    def tearDown(self):
        for p in reversed(self.patches): p.stop()
        self.tmp.cleanup()
    def args(self, **values):
        defaults = dict(existing_host=None, key=None, remote_dir=None, dry_run=False, ack_costs=True,
                        ssh_cidr='203.0.113.1/32', region='us-east-1', profile=None, subnet_id=None, ami=None)
        defaults.update(values)
        return SimpleNamespace(**defaults)
    def test_cost_and_ssh_boundaries_do_not_call_aws(self):
        with patch.object(relay, 'aws') as aws:
            with self.assertRaises(RuntimeError): relay.provision(self.args(ack_costs=False))
            with self.assertRaises(RuntimeError): relay.provision(self.args(ssh_cidr='0.0.0.0/0'))
            relay.provision(self.args(dry_run=True))
            aws.assert_not_called()
    def test_adopt_and_node_are_non_mutating(self):
        key = self.directory / 'key'; key.write_text('fixture')
        with patch.object(relay, 'aws') as aws:
            relay.provision(self.args(existing_host='ubuntu@example.org', key=str(key)))
            with patch.object(relay, 'remote', return_value='{"version":"fixture"}') as remote:
                relay.node(SimpleNamespace())
                self.assertIn('curl -fsS', remote.call_args.args[1])
                self.assertNotIn('up -d', remote.call_args.args[1])
            aws.assert_not_called()
            self.assertEqual(relay.STATE_FILE.stat().st_mode & 0o777, 0o600)
    def test_resumption_and_instance_payload(self):
        state = {'key': False, 'group': False, 'permissions': [], 'launches': {}, 'once_failed': False}
        def fake_run(command, **kwargs):
            if command[0] == 'ssh-keygen':
                Path(command[-1]).write_text('fixture'); Path(command[-1] + '.pub').write_text('public fixture')
            return ''
        def fake_aws(saved, service, action, *args):
            a = list(args)
            if action == 'describe-key-pairs': return {'KeyPairs': [{'KeyName':'exists'}] if state['key'] else []}
            if action == 'import-key-pair': state['key'] = True; return {}
            if action == 'describe-subnets': return {'Subnets':[{'SubnetId':'subnet-test','VpcId':'vpc-test','AvailabilityZone':'a'}]}
            if action == 'describe-security-groups': return {'SecurityGroups':[{'GroupId':'sg-test','IpPermissions':state['permissions']}] if state['group'] else []}
            if action == 'create-security-group': state['group'] = True; return {'GroupId':'sg-test'}
            if action == 'authorize-security-group-ingress':
                import json
                state['permissions'].extend(json.loads(a[a.index('--ip-permissions')+1])); return {}
            if action == 'get-parameter': return {'Parameter':{'Value':'ami-test'}}
            if action == 'describe-images': return {'Images':[{'Architecture':'x86_64','RootDeviceName':'/dev/sda1'}]}
            if action == 'run-instances':
                import json
                disk=json.loads(a[a.index('--block-device-mappings')+1])[0]['Ebs']
                self.assertEqual((disk['VolumeSize'],disk['Throughput'],disk['Iops'],disk['Encrypted']), (2000,125,3000,True))
                self.assertNotIn('--user-data', a)
                token=a[a.index('--client-token')+1]
                state['launches'].setdefault(token,'i-test')
                if not state['once_failed']:
                    state['once_failed']=True
                    raise RuntimeError('network interrupted after the server accepted the launch')
                return {'Instances':[{'InstanceId':'i-test'}]}
            if action == 'wait': return {}
            if action == 'describe-instances': return {'Reservations':[{'Instances':[{'PublicIpAddress':'203.0.113.2'}]}]}
            raise AssertionError(action)
        with patch.object(relay,'run',side_effect=fake_run), patch.object(relay,'aws',side_effect=fake_aws):
            with self.assertRaises(RuntimeError): relay.provision(self.args())
            relay.provision(self.args())
            relay.provision(self.args())
        self.assertEqual(len(state['launches']),1)
        self.assertEqual(len(state['permissions']),3)
        self.assertEqual(relay.load()['host'],'ubuntu@203.0.113.2')
    def test_adopted_host_cannot_be_stopped_or_destroyed(self):
        relay.save({'mode':'adopted','host':'ubuntu@example.org'})
        with patch.object(relay,'aws') as aws:
            with self.assertRaises(RuntimeError): relay.lifecycle(SimpleNamespace(command='destroy',confirm='i-test'))
            aws.assert_not_called()
    def test_destroy_requires_matching_id_and_ownership_tag(self):
        relay.save({'mode':'managed','instance_id':'i-test','region':'us-east-1','token':'test-owner'})
        with patch.object(relay,'aws') as aws:
            relay.lifecycle(SimpleNamespace(command='destroy',confirm=None)); aws.assert_not_called()
            aws.return_value={'Reservations':[{'Instances':[{'Tags':[{'Key':'RelayOwner','Value':'other-owner'}]}]}]}
            with self.assertRaises(RuntimeError): relay.lifecycle(SimpleNamespace(command='destroy',confirm='i-test'))
            self.assertEqual(aws.call_count,1)
    def test_remote_paths_and_hosts_cannot_inject_commands(self):
        for value in ['/', '/tmp/x;echo', '/opt/../etc', 'relative']:
            with self.assertRaises(RuntimeError): relay.validate_remote_dir(value)
        self.assertEqual(relay.validate_remote_dir('/opt/snapchain'),'/opt/snapchain')

if __name__ == '__main__': unittest.main()
