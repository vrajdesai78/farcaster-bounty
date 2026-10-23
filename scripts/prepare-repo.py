#!/usr/bin/env python3
"""Build a reviewed public-source archive from an allowlist; never include local deployment history."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

ROOT=Path(__file__).resolve().parents[1]
FILES={'relay','README.md','SETUP.md','LICENSE','SECURITY.md','CONTRIBUTING.md','NOTICE.md','.gitignore','vercel.json','.vercelignore'}
TREES=('client/','config/','site/','tests/','.github/','docs/public/')
DOCS={'docs/CURRENT-DOCS-REVIEW.md','docs/LIVE-CLIENT-VERIFICATION.md'}
SCRIPTS={'scripts/prepare-repo.py','scripts/serve-site.py','scripts/tunnel.sh','scripts/local-node.py'}
DENIED={'node_modules','dist','__pycache__','.relay-state','.relay-private','.snapchain-aws','.git','test-results','playwright-report','.vite','.impeccable','.agents','.codex','.aws'}
PATTERNS=[('private-key',re.compile(r'-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----')),
 ('aws-access-key',re.compile(r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b')),
 ('literal-private-key',re.compile(r'''(?:privateKey|private_key|SECRET_KEY)\s*[:=]\s*["'](?:0x)?[0-9a-fA-F]{64}["']'''))]

def candidates():
    for path in sorted(ROOT.rglob('*')):
        relative=path.relative_to(ROOT).as_posix()
        if any(part in DENIED for part in path.relative_to(ROOT).parts): continue
        if path.name in {'.npmrc','id_ed25519','id_rsa'} or path.suffix in {'.pem','.key'}: continue
        if path.name.startswith('.env') and path.name!='.env.example': continue
        if path.suffix in {'.zip','.tgz','.pyc','.tsbuildinfo'} or path.name=='.DS_Store': continue
        allowed=relative in FILES or relative in DOCS or relative in SCRIPTS or relative.startswith(TREES)
        if not allowed: continue
        if path.is_symlink(): raise RuntimeError('Public package refuses symlink: '+relative)
        if path.is_file(): yield path,relative

def build(output):
    files=list(candidates())
    manifest=[]
    for path,name in files:
        data=path.read_bytes()
        if path.suffix not in {'.png','.jpg','.webp','.woff2','.ttf','.ico'}:
            text=data.decode('utf-8',errors='replace')
            for kind,pattern in PATTERNS:
                if pattern.search(text): raise RuntimeError('Possible '+kind+' in '+name+'; value not printed. Review before packaging.')
        manifest.append({'path':name,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
    output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
        for (path,name) in files:
            info=zipfile.ZipInfo('relay/'+name,date_time=(2026,10,20,0,0,0))
            info.external_attr=(0o100755 if name=='relay' else 0o100644)<<16
            info.compress_type=zipfile.ZIP_DEFLATED
            archive.writestr(info,path.read_bytes())
        archive.writestr('relay/SOURCE-MANIFEST.json',json.dumps(manifest,indent=2)+'\n')
    return manifest

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT/'.relay-private/relay-source.zip')
    args=parser.parse_args()
    try:
        manifest=build(args.output.resolve())
        print(json.dumps({'archive':str(args.output),'files':len(manifest),'bytes':args.output.stat().st_size,'secret_scan':'passed','private_state':'excluded'},indent=2))
    except RuntimeError as error:
        raise SystemExit(str(error))
