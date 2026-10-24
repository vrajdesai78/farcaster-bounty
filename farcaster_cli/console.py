"""Small line-oriented terminal UI with safe, incremental log output."""
from collections import deque
import datetime
import os
import re
import subprocess
import sys
import threading
import time

ANSI = re.compile(r'\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\)')
SENSITIVE = re.compile(r'(?:authorization\s*:|(?:private[_ -]?key|mnemonic|recovery[_ -]?phrase|secret[_ -]?access[_ -]?key|password|login_hash)\s*[:=])', re.I)
ACCESS_KEY = re.compile(r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b')
URL_CREDENTIALS = re.compile(r'(https?://)[^\s/@]+:[^\s/@]+@', re.I)
URL_TOKEN = re.compile(r'([?&](?:api[_-]?key|token|secret|password)=)[^\s&]+', re.I)

class Sanitizer:
    def __init__(self):
        self.private_block = False
    def clean(self, line):
        line = ANSI.sub('', line).replace('\r', '')
        line = ''.join(c for c in line if c == '\t' or ord(c) >= 32)
        if '-----BEGIN ' in line and 'PRIVATE KEY-----' in line:
            self.private_block = True
            return '[private key output hidden]'
        if self.private_block:
            if '-----END ' in line and 'PRIVATE KEY-----' in line:
                self.private_block = False
            return ''
        if SENSITIVE.search(line):
            return '[credential-bearing output hidden]'
        line = ACCESS_KEY.sub('[access key hidden]', line)
        line = URL_CREDENTIALS.sub(r'\1[credentials hidden]@', line)
        return URL_TOKEN.sub(r'\1[hidden]', line)[:1600]

class LiveConsole:
    def __init__(self, stream=None, heartbeat=True, logfile=None):
        self.stream = stream or sys.stdout
        self.tty = self.stream.isatty()
        self.color = self.tty and 'NO_COLOR' not in os.environ
        self.lock = threading.RLock()
        self.stop_event = threading.Event()
        self.sanitizer = Sanitizer()
        self.title = 'Starting'
        self.started = time.monotonic()
        self.last_output = self.started
        self.thread = None
        self.heartbeat = heartbeat
        self.logfile = None
        if logfile is not None:
            self.set_logfile(logfile)
        self.history = deque(maxlen=80)
    def set_logfile(self, path):
        self.logfile = path
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        os.close(descriptor)
        os.chmod(path, 0o600)
    def __enter__(self):
        self.log('Farcaster node + client | live CLI', 'CLI')
        if self.heartbeat:
            self.thread = threading.Thread(target=self._heartbeat, daemon=True)
            self.thread.start()
        return self
    def __exit__(self, *unused):
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=1)
    def stage(self, title):
        self.title = title
        self.log(title, 'STEP')
    def log(self, line, kind='LOG'):
        with self.lock:
            cleaned = self.sanitizer.clean(str(line))
            if not cleaned:
                return
            stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%H:%M:%SZ')
            prefix = '[' + stamp + '] ' + kind.ljust(5)
            if self.color:
                prefix = '\033[36m' + prefix + '\033[0m'
            self.stream.write(prefix + ' ' + cleaned + '\n')
            if self.logfile is not None:
                if self.logfile.stat().st_size > 2 * 1024 * 1024:
                    self.logfile.replace(self.logfile.with_suffix('.log.1'))
                descriptor = os.open(self.logfile, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
                with os.fdopen(descriptor, 'a') as saved:
                    saved.write(datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds') + ' ' + kind + ' ' + cleaned + '\n')
                os.chmod(self.logfile, 0o600)
            self.stream.flush()
            self.history.append(cleaned)
            self.last_output = time.monotonic()
            return cleaned
    def _heartbeat(self):
        while not self.stop_event.wait(5):
            if time.monotonic() - self.last_output >= 5:
                elapsed = int(time.monotonic() - self.started)
                self.log(self.title + ' — still running (' + str(elapsed) + 's elapsed)', 'WAIT')
    def run(self, args, **kwargs):
        """Stream only explicitly selected installation/build commands, never stdin."""
        tail = deque(maxlen=25)
        process = subprocess.Popen([str(a) for a in args], stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, text=True, bufsize=1, **kwargs)
        try:
            for line in process.stdout:
                cleaned = self.log(line.rstrip('\n'))
                if cleaned:
                    tail.append(cleaned)
            code = process.wait()
        except BaseException:
            try:
                process.terminate()
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try:
                    process.kill()
                except ProcessLookupError:
                    pass
                process.wait()
            raise
        finally:
            process.stdout.close()
        if code:
            raise RuntimeError('Installation command failed (' + str(code) + '). ' + '\n'.join(tail)[-1800:])
        return ''  # Already displayed; do not replay the entire build after it ends.

class NodeLogFilter:
    """Keep snapshot progress and actionable messages readable; verbose retains raw detail."""
    def __init__(self, verbose=False):
        self.verbose = verbose
        self.last = {}
    def format(self, line):
        if self.verbose:
            return line
        behind = re.search(r'Falling behind.*height\.tip=\[(\d+)\]\s+(\d+).*height\.peer=\[\d+\]\s+(\d+)', line)
        if behind:
            shard, height, peer = behind.groups()
            difference = int(peer) - int(height)
            if difference < 5:
                return None
            return self._limited('shard-' + shard, 'Shard ' + shard + ' is catching up: ' + str(difference) + ' blocks behind its peer.')
        if re.search(r'snapshot|download|decompress|restor|extract|tar:', line, re.I):
            message = re.split(r'\b(?:INFO|WARN|ERROR)\s+', line, maxsplit=1)[-1]
            return message[-350:]
        if 'Already have a pending value request' in line:
            shard = re.search(r'height\.sync=\[(\d+)\]', line)
            return self._limited('pending-' + (shard[1] if shard else '?'), 'Waiting for a pending block request' + (' on shard ' + shard[1] if shard else '') + '.')
        if 'Failed to dial peer' in line:
            return self._limited('peer', 'A peer connection failed. Other peers may still be serving blocks; check shard progress above.')
        if ' ERROR ' in line:
            message = re.split(r'\bERROR\s+', line, maxsplit=1)[-1]
            return self._limited(message[:80], message[-350:])
        if ' WARN ' in line and 'No peer to request sync from' not in line and 'SYNC REQUIRED' not in line:
            message = re.split(r'\bWARN\s+', line, maxsplit=1)[-1]
            return self._limited(re.sub(r'\d+', '#', message[:80]), message[-250:])
        return None  # Routine per-block requests/hashes are represented by the live shard summary.
    def _limited(self, key, message):
        now = time.monotonic()
        previous = self.last.get(key)
        if previous is not None and now - previous < 30:
            return None
        if len(self.last) >= 80:
            self.last.pop(next(iter(self.last)))
        self.last[key] = now
        return message
