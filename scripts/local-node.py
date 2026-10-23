#!/usr/bin/env python3
"""Run the bundled node and client on this computer. No AWS or SSH commands."""
import argparse
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / '.relay-private' / 'local-node'

def run(args, capture=True, **kwargs):
    result = subprocess.run(args, check=True, text=True, capture_output=capture, **kwargs)
    return result.stdout.strip() if capture else ''

def requirements(info, free):
    if info.get('Architecture') not in ('x86_64', 'amd64') or info.get('OSType') != 'linux':
        raise RuntimeError('This pinned image path requires Linux x86_64 containers. Apple Silicon/ARM is not validated; use the AWS path.')
    if info.get('NCPU', 0) < 4 or info.get('MemTotal', 0) < 16_000_000_000:
        raise RuntimeError('Give Docker at least 4 CPUs and 16 GB RAM before continuing.')
    if free < 2_000_000_000_000:
        raise RuntimeError('The project drive needs at least 2 TB free for node data and restore space. Use AWS or another suitable drive.')

def check():
    endpoint = run(['docker', 'context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'])
    if not endpoint.startswith(('unix://', 'npipe://')):
        raise RuntimeError('Select a local Docker context; remote Docker daemons are not supported by this path.')
    version = run(['docker', 'compose', 'version', '--short']).lstrip('v').split('.')
    if tuple(int(x.split('-')[0]) for x in version[:3]) < (2,24,4):
        raise RuntimeError('Docker Compose 2.24.4+ is required for safe port overrides.')
    info = json.loads(run(['docker', 'info', '--format', '{{json .}}']))
    free = shutil.disk_usage(ROOT).free
    requirements(info, free)
    print('Checks passed: local Linux x86_64 Docker, >=4 CPUs, >=16 GB RAM, >=2 TB free project drive.')
    print('With Docker Desktop/WSL2, also verify the VM disk allocation and underlying physical free space. SSD and stable internet are required; leave the computer awake.')

def prepare():
    check()
    DIRECTORY.mkdir(parents=True, exist_ok=True)
    owner = DIRECTORY / '.local-node-owner'
    if not owner.exists() and any(DIRECTORY.iterdir()):
        raise RuntimeError('Local node folder is not owned by this helper. Do not overwrite an existing database.')
    if not owner.exists():
        owner.write_text('farcaster-local-node-v1\n')
        for name in ('compose.yml','validators.toml','local.yml'):
            shutil.copyfile(ROOT / 'config' / 'snapchain' / name, DIRECTORY / name)
    compose('config', '--quiet')
    print('Prepared local node files. No cloud resources or node containers started.')

def compose(*args):
    if not (DIRECTORY / '.local-node-owner').exists():
        raise RuntimeError('Run python3 scripts/local-node.py prepare first.')
    return run(['docker','compose','-p','farcaster-local','-f',str(DIRECTORY/'compose.yml'),'-f',str(DIRECTORY/'local.yml'),*args], capture=False)

def verify():
    def get(path):
        with urllib.request.urlopen('http://127.0.0.1:3381/v1/'+path,timeout=18) as response:
            return json.load(response)
    first=get('info')
    def near(info):
        shards=info.get('shardInfos',[])
        return bool(shards) and all(s['maxHeight']>0 and 0<=s['blockDelay']<10 for s in shards)
    print(json.dumps({'shards':first.get('shardInfos',[])},indent=2))
    if not near(first):raise RuntimeError('Restore/catch-up is not complete. Inspect local logs; do not restart progressing restore.')
    time.sleep(15); second=get('info')
    heights={s['shardId']:s['maxHeight'] for s in first['shardInfos']}
    if not near(second) or {s['shardId'] for s in second['shardInfos']}!=set(heights) or not all(s['maxHeight']>heights[s['shardId']] for s in second['shardInfos']):
        raise RuntimeError('Sync not verified across both samples.')
    casts=get('castsByFid?fid=2&pageSize=1')
    if not casts.get('messages'):raise RuntimeError('Real cast read failed.')
    evidence={'verified_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'first':first['shardInfos'],'second':second['shardInfos'],'read_hash':casts['messages'][0]['hash']}
    (DIRECTORY/'sync-evidence.json').write_text(json.dumps(evidence,indent=2)+'\n')
    print('SYNC VERIFIED: every shard advanced, delays below 10s in both samples, real cast read succeeded.')

def client():
    if not (DIRECTORY/'.local-node-owner').exists():
        raise RuntimeError('Run prepare and start before launching the all-local client.')
    try:
        with socket.socket() as probe:probe.bind(('127.0.0.1',5173))
    except OSError:
        raise RuntimeError('Port 5173 is already in use. Stop the earlier client first so you do not open a client connected to a different node.') from None
    version=tuple(map(int,run(['node','-p','process.versions.node']).split('.')[:2]))
    if version<(22,12):raise RuntimeError('Install Node.js 22.12+ for the local client.')
    if not (ROOT/'client/node_modules').is_dir():run(['npm','ci'],capture=False,cwd=ROOT/'client')
    print('Local client: http://127.0.0.1:5173 — keep this terminal open. Ctrl-C stops the client, not the node.',flush=True)
    run(['npm','run','dev'],capture=False,cwd=ROOT/'client',env=dict(os.environ,SNAPCHAIN_URL='http://127.0.0.1:3381',PORT='5173'))

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=['prepare','start','client','status','logs','stop'])
    args=parser.parse_args()
    if args.command=='prepare':prepare()
    elif args.command=='start':
        check();compose('up','-d','snapchain','statsd');print('Local restore started. Continue with the client while the node restores.')
    elif args.command=='client':client()
    elif args.command=='status':verify()
    elif args.command=='logs':compose('logs','--tail','40','snapchain')
    elif args.command=='stop':compose('down');print('Local containers stopped. Database retained in .relay-private/local-node; no AWS resources exist for this path.')

if __name__=='__main__':
    try:main()
    except KeyboardInterrupt:pass
    except (RuntimeError,OSError,ValueError,subprocess.CalledProcessError) as error:
        print('Local setup:',str(error));raise SystemExit(1)
