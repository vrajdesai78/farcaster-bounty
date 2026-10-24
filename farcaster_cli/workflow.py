"""Resumable setup and read-only monitoring for the CLI."""
import contextlib
import fcntl
import json
import os
import shlex
import signal
import subprocess
import sys
import threading
import time
import urllib.request
import urllib.parse
import base64

from . import commands, local
from .console import LiveConsole, NodeLogFilter

@contextlib.contextmanager
def live_output(console):
    previous = commands.CONSOLE
    commands.CONSOLE = console
    try:
        yield
    finally:
        commands.CONSOLE = previous

@contextlib.contextmanager
def setup_lock(path):
    with open(path, 'a') as lock:
        os.chmod(path, 0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('Another setup is using this deployment. Leave it running; use watch for read-only progress.') from None
        yield

def interval(value):
    value = float(value)
    if not 5 <= value <= 120:
        raise ValueError('Use an interval between 5 and 120 seconds.')
    return value

def timeout(value):
    value = float(value)
    if value < 0 or value != value or value == float('inf'):
        raise ValueError('Timeout must be zero or a positive number of seconds.')
    return value


def near(info):
    shards = info.get('shardInfos', [])
    return bool(shards) and all(isinstance(s.get('maxHeight'), (int,float)) and s['maxHeight'] > 0
                               and isinstance(s.get('blockDelay'), (int,float)) and 0 <= s['blockDelay'] < 10 for s in shards)

def progress_warnings(info, tracked, now):
    warnings = []
    for shard in info.get('shardInfos', []):
        key, height = shard.get('shardId'), shard.get('maxHeight')
        if not isinstance(height, (int, float)):
            continue
        previous = tracked.get(key)
        if previous is None or height != previous['height']:
            tracked[key] = {'height': height, 'advanced': now, 'warned': None}
        elif now - previous['advanced'] >= 45 and shard.get('blockDelay', 0) >= 10:
            if previous['warned'] is None or now - previous['warned'] >= 60:
                warnings.append('Shard ' + str(key) + ' has not advanced for ' + str(int(now - previous['advanced'])) + 's during this watch. The node is not ready; no automatic restart will be attempted.')
                previous['warned'] = now
    return warnings


def node_info(on_computer):
    if on_computer:
        with urllib.request.urlopen('http://127.0.0.1:3381/v1/info', timeout=10) as response:
            return json.load(response)
    return json.loads(commands.remote(commands.load(), 'curl -fsS --max-time 10 http://127.0.0.1:3381/v1/info'))

def client_healthy(state):
    url = state.get('client_url', '')
    parsed = urllib.parse.urlsplit(url)
    if not state.get('client_verified') or parsed.scheme != 'https' or parsed.netloc != state.get('client_domain'):
        return False
    try:
        headers = {}
        if not state.get('client_public'):
            access = json.loads((commands.STATE_DIR/'hosted-access.json').read_text())
            value = (access['username'] + ':' + access['password']).encode()
            headers['Authorization'] = 'Basic ' + base64.b64encode(value).decode()
        request = urllib.request.Request(url + '/healthz', headers=headers)
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.load(response).get('status') == 'ok'
    except (OSError, ValueError, KeyError):
        return False

def local_client_healthy():
    try:
        with urllib.request.urlopen('http://127.0.0.1:5173/api/config', timeout=4) as response:
            config = json.load(response)
        return config.get('mode') == 'local' and config.get('nodeUrl') == 'http://127.0.0.1:3381'
    except (OSError, ValueError):
        return False


class LogFollower:
    """Own only the local log-follow process; stopping it never stops a node."""
    def __init__(self, args, console):
        self.args, self.console = args, console
        self.process = None
        self.reader = None
        self.filter = NodeLogFilter(getattr(args, 'verbose', False))
    def __enter__(self):
        return self
    def __exit__(self, *unused):
        self.close()
    def ensure_started(self):
        if self.process is not None and self.process.poll() is None:
            return
        self.close()
        try:
            if self.args.local:
                command = ['docker','compose','-p','farcaster-local','-f',str(local.DIRECTORY/'compose.yml'),'-f',str(local.DIRECTORY/'local.yml'),
                           'logs','--follow','--no-color','--timestamps','--tail','20','snapchain']
            else:
                state = commands.load()
                directory = commands.validate_remote_dir(state['remote_dir'])
                compose = 'compose.yml' if state['mode'] == 'managed' else 'docker-compose.yml'
                command = commands.ssh_args(state) + ['cd ' + shlex.quote(directory) + ' && sudo docker compose -f ' + compose +
                                                       ' logs --follow --no-color --timestamps --tail 20 snapchain']
            process = subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1,start_new_session=True)
            self.process = process
            def read():
                for line in process.stdout:
                    message = self.filter.format(line.rstrip('\n'))
                    if message:
                        self.console.log(message, 'NODE')
            self.reader = threading.Thread(target=read,daemon=True)
            self.reader.start()
        except (RuntimeError, OSError) as error:
            self.console.log('Log connection is unavailable: ' + str(error)[:240], 'WAIT')
    def close(self):
        process = self.process
        if process is None:
            return
        if process.poll() is None:
            try:
                os.killpg(process.pid,signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid,signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait()
        if self.reader:
            self.reader.join(timeout=2)
        process.stdout.close()
        self.process, self.reader = None, None


def monitor(args, console, child=None):
    with LogFollower(args, console) as follower:
        return _monitor(args, console, follower, child)


def _monitor(args, console, follower, child=None):
    delay = interval(args.interval)
    verified = False
    tracked = {}
    duration = timeout(getattr(args, 'timeout', 0))
    deadline = time.monotonic() + duration if duration else None
    console.stage('Following restore and live blocks' if not getattr(args, 'watch_only', False) else 'Watching the existing node')
    while True:
        if deadline is not None and time.monotonic() >= deadline:
            raise RuntimeError('Watching timed out before completion. The node was left running; resume with watch.')
        follower.ensure_started()
        if child is not None and child.poll() is not None:
            raise RuntimeError('The local client stopped. Its error is in the log above. The node was left running.')
        try:
            info = node_info(args.local)
            shards = info.get('shardInfos', [])
            text = ' | '.join('Shard ' + str(s.get('shardId')) + ': height ' + str(s.get('maxHeight')) + ', ' + str(s.get('blockDelay')) + 's behind' for s in shards)
            console.log(text or 'API is available; shard status is not ready.', 'SYNC')
            healthy = near(info)
            if healthy and child is not None and not local_client_healthy():
                console.log('Node is near head; waiting for the local web client to finish starting.', 'WAIT')
                healthy = False
            for warning in progress_warnings(info, tracked, time.monotonic()):
                console.log(warning, 'WARN')
        except (RuntimeError, OSError, ValueError) as error:
            healthy = False
            console.log('Node API unavailable (restore or connection status is not verified): ' + str(error)[:240], 'WAIT')
        if healthy and not verified:
            console.stage('Verifying two samples and a real cast read')
            try:
                if args.local:
                    local.verify()
                else:
                    commands.status(type('Status', (), {'verify': True})())
                verified = True
                console.log('SYNC VERIFIED — two advancing samples, every shard below 10s, real cast returned.', 'READY')
                if args.local:
                    console.log(('Client: ' if child is not None else 'Local client URL, if running: ') + 'http://127.0.0.1:5173/', 'READY')
                else:
                    state = commands.load()
                    console.log('Saved client URL: ' + state.get('client_url', 'use ./farcaster client to deploy it'), 'READY')
                    if not state.get('client_public'):
                        console.log('Retrieve the private website login with ./farcaster client --credentials in a private terminal.', 'LOGIN')
                if args.once:
                    return
                console.stage('Node is ready — watching live blocks; Ctrl-C leaves hosted services running')
            except (RuntimeError, OSError, ValueError) as error:
                console.log('Verification is not complete: ' + str(error)[:240], 'WAIT')
                console.stage('Following restore and live blocks')
        elif verified and not healthy:
            verified = False
            console.log('A readiness check no longer passes. Watching for recovery; no restart will be attempted.', 'WARN')
        time.sleep(delay)

def setup(args):
    interval(args.interval)
    if args.local and (args.existing_host or args.domain or args.ssh_cidr or args.public_client or args.private_client):
        raise RuntimeError('--local runs both services here; do not combine it with remote-host/domain/access options.')
    if args.dry_run:
        if args.local:
            print('PLAN: check local capacity, start local node/client, follow sync. No containers or cloud resources started.')
        else:
            commands.provision(args)
            print('Then: install node, build HTTPS client, show logs and verify sync. No installation performed.')
        return
    if args.local:
        return setup_local(args)
    commands.STATE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    with LiveConsole(logfile=commands.STATE_DIR/'setup.log') as console, live_output(console):
        console.log('Log: ' + str(commands.STATE_DIR/'setup.log') + ' (sanitized, rotating)', 'CLI')
        console.log('For another terminal, copy: cd ' + shlex.quote(str(commands.ROOT)), 'CLI')
        try:
            # Release after installation so another terminal can read credentials or manage the client.
            with setup_lock(commands.STATE_DIR/'lock'):
                console.stage('1/4 · Provision or resume the server')
                commands.provision(args)
                console.stage('2/4 · Install or resume Snapchain')
                commands.node(args)
                console.stage('3/4 · Build and start the HTTPS client')
                state = commands.load()
                access_change = args.domain or args.public_client or args.private_client
                if not access_change and client_healthy(state):
                    console.log('Existing client is healthy; keeping it running.', 'RESUME')
                else:
                    args.credentials = False
                    args.quiet_credentials = True
                    commands.client(args)
            console.stage('4/4 · Follow sync and verify reads')
            monitor(args, console)
        except KeyboardInterrupt:
            console.log('Stopped watching. Hosted node/client keep running and AWS billing continues. Resume with the same command.', 'CLI')
        except Exception:
            console.log('Setup stopped at this stage. Saved resources were not deleted. Resume from this same project folder.', 'ERROR')
            raise

def setup_local(args):
    child = None
    reader = None
    with LiveConsole() as console:
        try:
            console.stage('1/4 · Check local Docker, hardware and configuration')
            local.prepare()
            with setup_lock(local.DIRECTORY/'setup.lock'):
                console.set_logfile(local.DIRECTORY/'setup.log')
                console.stage('2/4 · Start the local Snapchain node')
                local.compose('up','-d','snapchain','statsd')
                console.stage('3/4 · Start the local client')
                child = subprocess.Popen([sys.executable,'-m','farcaster_cli','local','client'],cwd=local.ROOT,
                                         stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1,start_new_session=True)
                def read():
                    for line in child.stdout:
                        console.log(line.rstrip('\n'), 'WEB')
                reader = threading.Thread(target=read,daemon=True)
                reader.start()
                console.stage('4/4 · Follow sync and verify reads')
                monitor(args,console,child)
        except KeyboardInterrupt:
            console.log('Leaving the local node running. This CLI will stop only the local client it launched.', 'CLI')
        finally:
            if child is not None:
                if child.poll() is None:
                    try:
                        os.killpg(child.pid,signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                    try:
                        child.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        try:
                            os.killpg(child.pid,signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                        child.wait()
                if reader:
                    reader.join(timeout=2)
                child.stdout.close()

def watch(args):
    interval(args.interval)
    if args.local:
        if not (local.DIRECTORY/'.local-node-owner').exists():
            raise RuntimeError('No owned local deployment. Run ./farcaster setup --local first.')
        logfile = local.DIRECTORY/'setup.log'
    else:
        commands.load()
        logfile = commands.STATE_DIR/'setup.log'
    args.watch_only = True
    with LiveConsole(logfile=logfile) as console:
        try:
            monitor(args,console)
        except KeyboardInterrupt:
            console.log('Stopped watching. No service or resource was stopped or deleted.', 'CLI')
