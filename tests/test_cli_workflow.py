import contextlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch, Mock

from farcaster_cli import commands, workflow
from farcaster_cli.console import LiveConsole, Sanitizer, NodeLogFilter

class CliTests(unittest.TestCase):
    def args(self, **changes):
        values=dict(local=False,once=True,interval=5,timeout=60,dry_run=False,existing_host=None,domain=None,
                    ssh_cidr='203.0.113.10/32',public_client=False,private_client=False,ack_costs=True)
        values.update(changes)
        return SimpleNamespace(**values)
    def console(self):
        return LiveConsole(stream=io.StringIO(),heartbeat=False)
    def test_sanitizer_hides_credentials_but_keeps_useful_progress(self):
        clean=Sanitizer()
        for value in ['PASSWORD=do-not-show','Authorization: Basic not-public','private_key: abc','mnemonic=do not show']:
            self.assertNotIn('do-not-show',clean.clean(value));self.assertIn('hidden',clean.clean(value))
        self.assertIn('hidden',clean.clean('https://name:secret@example.com/path?api_key=secret'))
        self.assertNotIn('secret',clean.clean('https://name:secret@example.com/path?api_key=secret'))
        clean.clean('-----BEGIN '+'OPENSSH PRIVATE KEY-----')
        self.assertEqual(clean.clean('secret body'),'')
        clean.clean('-----END '+'OPENSSH PRIVATE KEY-----')
        self.assertIn('Restoring 37%',clean.clean('\x1b[31mRestoring 37%\x1b[0m'))
        self.assertLessEqual(len(clean.clean('x'*5000)),1600)
    def test_log_is_private_rotates_and_never_saves_credentials(self):
        with tempfile.TemporaryDirectory() as name:
            path=Path(name)/'setup.log'
            console=LiveConsole(stream=io.StringIO(),heartbeat=False,logfile=path)
            console.log('password=not-public');console.log('snapshot progress 37%')
            self.assertNotIn('not-public',path.read_text());self.assertIn('37%',path.read_text())
            self.assertEqual(path.stat().st_mode&0o777,0o600)
            path.write_text('x'*(2*1024*1024+1))
            console.log('next stage')
            self.assertTrue(path.with_suffix('.log.1').exists());self.assertIn('next stage',path.read_text())
            self.assertEqual(path.stat().st_mode&0o777,0o600)
    def test_install_output_arrives_before_the_process_exits(self):
        console=self.console()
        script="import time;print('build started',flush=True);time.sleep(.3);print('build finished',flush=True)"
        from threading import Thread
        thread=Thread(target=lambda:console.run([sys.executable,'-c',script]));thread.start()
        deadline=time.monotonic()+2
        while 'build started' not in console.stream.getvalue() and time.monotonic()<deadline:time.sleep(.01)
        self.assertIn('build started',console.stream.getvalue());self.assertTrue(thread.is_alive())
        thread.join(timeout=3);self.assertIn('build finished',console.stream.getvalue())
    def test_bad_install_reports_bounded_sanitized_tail(self):
        console=self.console()
        with self.assertRaisesRegex(RuntimeError,'failed') as result:
            console.run([sys.executable,'-c',"print('password=not-public');raise SystemExit(2)"])
        self.assertNotIn('not-public',str(result.exception))
    def test_streaming_is_explicit_and_never_uses_input_payloads(self):
        console=Mock()
        with patch.object(commands,'CONSOLE',console),patch.object(commands.subprocess,'run',return_value=SimpleNamespace(returncode=0,stdout='',stderr='')) as run:
            commands.run(['ssh','host'],live=True,input='private payload')
            console.run.assert_not_called();run.assert_called_once()
            commands.run(['ssh','host'],live=True)
            console.run.assert_called_once_with(['ssh','host'])
    def test_setup_dry_run_never_installs_or_monitors(self):
        with patch.object(commands,'provision') as provision,patch.object(commands,'node') as node,patch.object(commands,'client') as client,patch.object(workflow,'monitor') as monitor:
            workflow.setup(self.args(dry_run=True))
            provision.assert_called_once();node.assert_not_called();client.assert_not_called();monitor.assert_not_called()
    def test_local_dry_run_never_calls_aws_or_docker(self):
        with patch.object(commands,'provision') as provision,patch.object(workflow.local,'prepare') as prepare:
            workflow.setup(self.args(local=True,ssh_cidr=None,dry_run=True))
            provision.assert_not_called();prepare.assert_not_called()
    def test_setup_resumes_healthy_client_without_restarting_it(self):
        with tempfile.TemporaryDirectory() as name,patch.object(commands,'STATE_DIR',Path(name)),patch.object(workflow,'LiveConsole',return_value=self.console()),patch.object(commands,'provision') as provision,patch.object(commands,'node') as node,patch.object(commands,'load',return_value={}),patch.object(workflow,'client_healthy',return_value=True),patch.object(commands,'client') as client,patch.object(workflow,'monitor') as monitor:
            workflow.setup(self.args());provision.assert_called_once();node.assert_called_once();client.assert_not_called();monitor.assert_called_once()
            # The install lock is released before long-running monitoring.
            with workflow.setup_lock(Path(name)/'lock'):pass
    def test_failed_provision_never_installs_or_discards_saved_state(self):
        with tempfile.TemporaryDirectory() as name,patch.object(commands,'STATE_DIR',Path(name)),patch.object(workflow,'LiveConsole',return_value=self.console()),patch.object(commands,'provision',side_effect=RuntimeError('cost acknowledgement missing')),patch.object(commands,'node') as node,patch.object(commands,'client') as client,patch.object(commands,'lifecycle') as lifecycle:
            with self.assertRaisesRegex(RuntimeError,'cost acknowledgement'):workflow.setup(self.args(ack_costs=False))
            node.assert_not_called();client.assert_not_called();lifecycle.assert_not_called()
    def test_monitor_does_not_call_sync_verified_for_one_sample(self):
        healthy={'shardInfos':[{'shardId':1,'maxHeight':4,'blockDelay':1}]}
        console=self.console()
        with patch.object(workflow,'LogFollower'),patch.object(workflow,'node_info',return_value=healthy),patch.object(commands,'status',side_effect=RuntimeError('second sample did not advance')),patch.object(workflow.time,'sleep',side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt):workflow.monitor(self.args(),console)
        self.assertNotIn('READY',console.stream.getvalue())
    def test_monitor_ready_requires_existing_two_sample_and_real_read_verifier(self):
        healthy={'shardInfos':[{'shardId':1,'maxHeight':4,'blockDelay':1}]}
        with patch.object(workflow,'LogFollower'),patch.object(workflow,'node_info',return_value=healthy),patch.object(commands,'status') as verify,patch.object(commands,'load',return_value={'client_url':'https://client.example','client_public':True}),patch.object(commands,'lifecycle') as lifecycle:
            console=self.console();workflow.monitor(self.args(),console)
            self.assertTrue(verify.call_args.args[0].verify);self.assertIn('READY',console.stream.getvalue());lifecycle.assert_not_called()
    def test_monitor_timeout_never_stops_a_node(self):
        with patch.object(workflow,'LogFollower'),patch.object(workflow.time,'monotonic',side_effect=[0,100]),patch.object(commands,'lifecycle') as lifecycle:
            with self.assertRaisesRegex(RuntimeError,'timed out'):workflow.monitor(self.args(timeout=1),Mock())
            lifecycle.assert_not_called()
    def test_private_resume_health_uses_login_only_for_the_saved_domain(self):
        from io import BytesIO
        with tempfile.TemporaryDirectory() as name,patch.object(commands,'STATE_DIR',Path(name)):
            (Path(name)/'hosted-access.json').write_text(json.dumps({'username':'fixture','password':'private'}))
            state={'client_url':'https://client.example','client_domain':'client.example','client_verified':True}
            with patch.object(workflow.urllib.request,'urlopen',return_value=BytesIO(b'{"status":"ok"}')) as get:
                self.assertTrue(workflow.client_healthy(state));self.assertIn('Authorization',get.call_args.args[0].headers)
                get.reset_mock();self.assertFalse(workflow.client_healthy(dict(state,client_url='https://other.example')));get.assert_not_called()
    def test_non_advancing_shard_is_reported_without_restarting_anything(self):
        tracked={}
        info={'shardInfos':[{'shardId':1,'maxHeight':100,'blockDelay':100}]}
        self.assertEqual(workflow.progress_warnings(info,tracked,0),[])
        self.assertEqual(len(workflow.progress_warnings(info,tracked,46)),1)
        self.assertEqual(workflow.progress_warnings(info,tracked,60),[])
        info['shardInfos'][0]['maxHeight']=101
        self.assertEqual(workflow.progress_warnings(info,tracked,100),[])

    def test_default_node_output_is_readable_and_verbose_keeps_diagnostics(self):
        log='2026-10-24 WARN actor: SYNC REQUIRED: Falling behind height.tip=[1] 100 height.sync=[1] 101 height.peer=[1] 14000'
        readable=NodeLogFilter()
        self.assertIn('13900 blocks',readable.format(log));self.assertIsNone(readable.format(log))
        self.assertIsNone(readable.format('INFO actor: Processed decided block height=[0] 123 hash=abc'))
        self.assertIn('37%',readable.format('INFO snapshot: Restoring 37%'))
        self.assertEqual(NodeLogFilter(verbose=True).format(log),log)

    def test_local_readiness_requires_the_client_to_target_this_local_node(self):
        with patch.object(workflow.urllib.request,'urlopen',return_value=io.BytesIO(b'{"mode":"local","nodeUrl":"http://127.0.0.1:3381"}')):
            self.assertTrue(workflow.local_client_healthy())
        with patch.object(workflow.urllib.request,'urlopen',return_value=io.BytesIO(b'{"mode":"local","nodeUrl":"https://different-node.example"}')):
            self.assertFalse(workflow.local_client_healthy())

    def test_log_follower_stops_only_its_own_log_process(self):
        process=Mock();process.stdout=io.StringIO('INFO snapshot: Downloading 37%\n');process.poll.return_value=None;process.pid=123456
        state={'mode':'managed','remote_dir':'/opt/relay-snapchain'}
        with patch.object(commands,'load',return_value=state),patch.object(commands,'ssh_args',return_value=['ssh','saved-host']),patch.object(workflow.subprocess,'Popen',return_value=process) as start,patch.object(workflow.os,'killpg') as stop,patch.object(commands,'lifecycle') as lifecycle:
            with workflow.LogFollower(self.args(),self.console()) as follower:follower.ensure_started()
            command=start.call_args.args[0]
            self.assertIn('logs --follow',command[-1]);self.assertNotIn('restart',command[-1])
            stop.assert_called_once_with(process.pid,workflow.signal.SIGTERM);lifecycle.assert_not_called()

    def test_local_interrupt_stops_its_client_child_but_never_the_node(self):
        process=Mock();process.stdout=io.StringIO('client starting\n');process.poll.return_value=None;process.pid=123456
        with tempfile.TemporaryDirectory() as name,patch.object(workflow.local,'DIRECTORY',Path(name)),patch.object(workflow.local,'prepare'),patch.object(workflow.local,'compose') as compose,patch.object(workflow,'LiveConsole',return_value=self.console()),patch.object(workflow.subprocess,'Popen',return_value=process),patch.object(workflow.os,'killpg') as stop,patch.object(workflow,'monitor',side_effect=KeyboardInterrupt),patch.object(commands,'aws') as aws:
            workflow.setup_local(self.args(local=True,ssh_cidr=None))
            compose.assert_called_once_with('up','-d','snapchain','statsd')
            stop.assert_called_once_with(process.pid,workflow.signal.SIGTERM);aws.assert_not_called()

    def test_setup_hides_credentials_when_building_the_client(self):
        with tempfile.TemporaryDirectory() as name,patch.object(commands,'STATE_DIR',Path(name)),patch.object(workflow,'LiveConsole',return_value=self.console()),patch.object(commands,'provision'),patch.object(commands,'node'),patch.object(commands,'load',return_value={}),patch.object(workflow,'client_healthy',return_value=False),patch.object(commands,'client') as client,patch.object(workflow,'monitor'):
            workflow.setup(self.args())
            self.assertTrue(client.call_args.args[0].quiet_credentials)
            self.assertFalse(client.call_args.args[0].credentials)

    def test_timing_options_are_bounded(self):
        for value in [0,4,121,'nan','inf']:
            with self.assertRaises(ValueError):workflow.interval(value)
        for value in [-1,'nan','inf']:
            with self.assertRaises(ValueError):workflow.timeout(value)
        self.assertEqual(workflow.interval(15),15)

if __name__=='__main__':unittest.main()
