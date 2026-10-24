#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from functools import partial
import argparse
parser=argparse.ArgumentParser(description='Preview the static Farcaster guide locally; no node proxy or key handling.')
parser.add_argument('--port',type=int,default=4173)
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]/'site'
print('Farcaster guide: http://127.0.0.1:'+str(args.port),flush=True)
try: ThreadingHTTPServer(('127.0.0.1',args.port),partial(SimpleHTTPRequestHandler,directory=str(root))).serve_forever()
except KeyboardInterrupt: pass
