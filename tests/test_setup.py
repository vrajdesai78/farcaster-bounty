import importlib.util
from importlib.machinery import SourceFileLoader
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
import fcntl
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
        self.check_resumption_payload()
    def test_test_expiry_is_atomic_and_preserved_across_launch_retry(self):
        self.check_resumption_payload(lifetime=24)
    def test_test_expiry_rejects_unsafe_or_existing_targets_before_aws(self):
        with patch.object(relay, 'aws') as aws:
            for hours in [0, -1, 49]:
                with self.assertRaises(RuntimeError): relay.provision(self.args(test_lifetime_hours=hours))
            with self.assertRaises(RuntimeError):
                relay.provision(self.args(test_lifetime_hours=24, existing_host='ubuntu@example.org'))
            relay.save({'host': 'ubuntu@example.org'})
            with self.assertRaises(RuntimeError): relay.provision(self.args(test_lifetime_hours=24))
            aws.assert_not_called()
    def check_resumption_payload(self, lifetime=None):
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
                if lifetime:
                    self.assertEqual(a[a.index('--instance-initiated-shutdown-behavior')+1], 'terminate')
                    script=Path(a[a.index('--user-data')+1].removeprefix('file://')).read_text()
                    self.assertIn('/usr/sbin/shutdown -h now', script)
                    self.assertIn('Persistent=true', script)
                    deadline=relay.load()['test_terminate_at']
                    self.assertIn(relay.time.strftime('%Y-%m-%d %H:%M:%S UTC', relay.time.gmtime(deadline)), script)
                    self.assertEqual(state.setdefault('deadline',deadline),deadline)
                    self.assertTrue(disk['DeleteOnTermination'])
                else:
                    self.assertNotIn('--user-data', a)
                    self.assertNotIn('--instance-initiated-shutdown-behavior', a)
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
            with self.assertRaises(RuntimeError): relay.provision(self.args(test_lifetime_hours=lifetime))
            relay.provision(self.args(test_lifetime_hours=lifetime))
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

    def test_hosted_domain_needs_no_purchased_domain_and_rejects_shell_input(self):
        state={'host':'ubuntu@8.8.8.8'}
        self.assertEqual(relay.client_domain(state),'relay-8-8-8-8.sslip.io')
        self.assertEqual(relay.client_domain(state,'client.example.com'),'client.example.com')
        for value in ['https://client.example.com','x;echo.example.com','*.example.com','a..example.com','x.example.com/path']:
            with self.assertRaises(RuntimeError): relay.client_domain(state,value)
        with self.assertRaises(RuntimeError): relay.client_domain({'host':'ubuntu@127.0.0.1'})

    def test_hosted_dns_rejects_wrong_server_before_login_is_sent(self):
        with patch.object(relay.socket,'gethostbyname',return_value='8.8.8.8'), patch.object(relay.socket,'getaddrinfo',return_value=[(2,1,6,'',('1.1.1.1',0))]):
            with self.assertRaisesRegex(RuntimeError,'DNS must point directly'): relay.verify_client_dns({'host':'ubuntu@8.8.8.8'},'client.example.com')
        with patch.object(relay.socket,'gethostbyname',return_value='8.8.8.8'), patch.object(relay.socket,'getaddrinfo',return_value=[(2,1,6,'',('8.8.8.8',0))]):
            relay.verify_client_dns({'host':'ubuntu@8.8.8.8'},'client.example.com')

    def test_hosted_source_omits_wallet_state_env_and_dependencies(self):
        import tarfile
        for name in ['client/package.json','client/package-lock.json','client/index.html','client/tsconfig.json','client/vite.config.ts','client/server/production.mjs','client/src/App.tsx','client/public/favicon.svg','config/client/Dockerfile','client/.env','client/node_modules/private.js','.snapchain-aws/test-account.json','.relay-state/hosted-access.json']:
            path=self.directory/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text('fixture')
        archive=self.directory/'source.tgz'
        with patch.object(relay,'ROOT',self.directory): relay.client_source_archive(archive)
        with tarfile.open(archive) as packed:
            names=packed.getnames()
        self.assertIn('client/server/production.mjs',names)
        self.assertIn('config/client/Dockerfile',names)
        self.assertFalse(any('.env' in n or 'node_modules' in n or 'hosted-access' in n or 'test-account' in n for n in names))
        self.assertEqual(archive.stat().st_mode & 0o777,0o600)

    def test_hosted_firewall_changes_require_instance_ownership(self):
        state={'mode':'managed','instance_id':'i-test','token':'owner','security_group':'sg-test'}
        with patch.object(relay,'aws') as aws:
            aws.return_value={'Reservations':[{'Instances':[{'Tags':[{'Key':'RelayOwner','Value':'other'}]}]}]}
            with self.assertRaises(RuntimeError): relay.hosted_web_rules(state)
            self.assertEqual(aws.call_count,1)
        with patch.object(relay,'aws') as aws:
            relay.hosted_web_rules({'mode':'adopted'})
            aws.assert_not_called()

    def test_sync_check_uses_short_ssh_queries_without_local_tunnel(self):
        import json
        first={'version':'fixture','shardInfos':[{'shardId':0,'maxHeight':1,'blockDelay':0},{'shardId':1,'maxHeight':2,'blockDelay':1}]}
        second={'version':'fixture','shardInfos':[{'shardId':0,'maxHeight':2,'blockDelay':1},{'shardId':1,'maxHeight':3,'blockDelay':0}]}
        relay.save({'mode':'adopted','host':'ubuntu@example.org'})
        with patch.object(relay,'remote',side_effect=[json.dumps(first),json.dumps(second),json.dumps({'messages':[{'hash':'fixture'}]})]), patch.object(relay,'tunnel') as tunnel, patch.object(relay.time,'sleep'):
            relay.status(SimpleNamespace(verify=True))
            tunnel.assert_not_called()
        self.assertTrue((self.directory/'sync-evidence.json').exists())

    def test_diagnostics_work_while_an_install_holds_the_state_lock(self):
        with open(self.directory/'lock', 'a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            for command in ['logs', 'status']:
                with self.subTest(command=command), patch.object(relay, command) as diagnostic, patch('sys.argv', ['relay', command]):
                    relay.main()
                    diagnostic.assert_called_once()
            with patch.object(relay, 'node') as install, patch('sys.argv', ['relay', 'node']):
                with self.assertRaises(BlockingIOError): relay.main()
                install.assert_not_called()

if __name__ == '__main__': unittest.main()
