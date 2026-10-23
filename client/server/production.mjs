import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const endpoints = new Set(['info','events','storageLimitsByFid','castsByFid','castById','castsByParent','userDataByFid','linksByFid','linkById','reactionsByFid','reactionsByCast','signer','signersByFid','onChainIdRegistryEventByAddress','submitMessage','validateMessage']);
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const security = {
  'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer', 'X-Frame-Options':'DENY',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https: wss:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
};

export function createRelayServer(options) {
  const origin = new URL(options.origin);
  if (origin.protocol !== 'https:' || origin.origin !== options.origin || origin.username || origin.password) throw new Error('PUBLIC_ORIGIN must be one HTTPS origin.');
  const target = new URL(options.target || 'http://127.0.0.1:3381');
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('Invalid upstream URL.');
  if (!/^[a-f0-9]{64}$/.test(options.loginHash || '')) throw new Error('A generated RELAY_LOGIN_HASH is required.');
  const expected = Buffer.from(options.loginHash,'hex');
  const directory = resolve(options.directory || new URL('../dist',import.meta.url).pathname);
  const buckets = new Map();
  let active = 0;
  let globalBudget = {start:Date.now(), reads:0, writes:0};
  const json = (res,status,data,headers={}) => {
    res.writeHead(status,{...security,'Content-Type':'application/json','Cache-Control':'no-store',...headers});
    res.end(JSON.stringify(data));
  };
  function limited(ip,write=false) {
    const now=Date.now();
    if(now-globalBudget.start>=60000)globalBudget={start:now,reads:0,writes:0};
    if(write ? ++globalBudget.writes>(options.globalWriteLimit ?? 120) : ++globalBudget.reads>(options.globalReadLimit ?? 6000))return true;
    if(buckets.size>=2048) for(const [key,value] of buckets) if(now-value.start>=60000) buckets.delete(key);
    if(!buckets.has(ip)) {
      if(buckets.size>=2048) return true;
      buckets.set(ip,{start:now,reads:0,writes:0});
    }
    let bucket=buckets.get(ip);
    if(now-bucket.start>=60000) { bucket={start:now,reads:0,writes:0}; buckets.set(ip,bucket); }
    if(write) return ++bucket.writes>(options.writeLimit ?? 30);
    return ++bucket.reads>(options.readLimit ?? 600);
  }
  const server = http.createServer(async(req,res)=>{
    try {
      // Caddy overwrites this header and is the only network-facing listener.
      const ip=String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).slice(0,80);
      if(limited(ip)) return json(res,429,{error:'Too many requests. Wait a minute and retry.'},{'Retry-After':'60'});
      if(req.headers.host!==origin.host || (req.headers.origin && req.headers.origin!==origin.origin)) return json(res,403,{error:'Origin rejected.'});
      const auth=req.headers.authorization || '';
      let decoded='';
      if(auth.startsWith('Basic ') && auth.length<1024) decoded=Buffer.from(auth.slice(6),'base64').toString('utf8');
      const provided=createHash('sha256').update(decoded).digest();
      const publicInstallAsset=['/manifest.webmanifest','/sw.js','/assets/app-192.png','/assets/app-512.png'].includes(new URL(req.url,origin).pathname);
      if(options.publicAccess !== true && !publicInstallAsset && !timingSafeEqual(provided,expected)) return json(res,401,{error:'Sign in with the generated client login.'},{'WWW-Authenticate':'Basic realm="Farcaster client", charset="UTF-8"'});
      const url=new URL(req.url,origin);
      if(req.url.length>8192) return json(res,414,{error:'Request URL too long.'});
      if(url.pathname==='/healthz') return json(res,200,{status:'ok'});
      if(url.pathname==='/api/config') {
        if(req.method!=='GET') return json(res,405,{error:'Method not allowed.'});
        return json(res,200,{nodeUrl:origin.origin+'/api/node',mode:'hosted',publicAccess:options.publicAccess === true,transport:'Hosted client · node on this server'});
      }
      if(url.pathname==='/setup') { res.writeHead(302,{...security,Location:options.guide || 'https://farcaster-client-sable.vercel.app/','Cache-Control':'no-store'}); return res.end(); }
      if(!url.pathname.startsWith('/api/node/')) {
        if(!['GET','HEAD'].includes(req.method)) return json(res,405,{error:'Method not allowed.'});
        const path=decodeURIComponent(url.pathname);
        if(path!=='/' && path!=='/favicon.svg' && path!=='/manifest.webmanifest' && path!=='/sw.js' && !path.startsWith('/assets/')) return json(res,404,{error:'Not found.'});
        const relative=path==='/'?'index.html':path.slice(1);
        if(relative.split('/').some(part=>part.startsWith('.'))) return json(res,404,{error:'Not found.'});
        const file=resolve(directory,relative);
        if(!file.startsWith(directory+sep)) return json(res,404,{error:'Not found.'});
        try {
          const info=await stat(file);
          if(!info.isFile() || info.size>8*1024*1024) return json(res,404,{error:'Not found.'});
          const data=await readFile(file);
          res.writeHead(200,{...security,'Content-Type':mime[extname(file)] || 'application/octet-stream','Cache-Control':relative.startsWith('assets/')?'private, max-age=31536000, immutable':'no-store'});
          return res.end(req.method==='HEAD'?undefined:data);
        } catch { return json(res,404,{error:'Not found.'}); }
      }
      const endpoint=url.pathname.slice('/api/node/'.length);
      if(!endpoints.has(endpoint)) return json(res,404,{error:'Unsupported node endpoint.'});
      const writing=['submitMessage','validateMessage'].includes(endpoint);
      if(req.method!==(writing?'POST':'GET')) return json(res,405,{error:'Method not allowed.'});
      if(writing && req.headers.origin!==origin.origin) return json(res,403,{error:'A same-origin signed request is required.'});
      if(writing && limited(ip,true)) return json(res,429,{error:'Too many signed submissions. Wait a minute.'},{'Retry-After':'60'});
      if(writing && req.headers['content-type']!=='application/octet-stream') return json(res,415,{error:'Expected signed protobuf bytes.'});
      const pageSize=url.searchParams.get('pageSize');
      if(pageSize!==null && (!/^\d+$/.test(pageSize) || Number(pageSize)>250)) return json(res,400,{error:'pageSize must be at most 250.'});
      let body;
      if(writing) {
        const chunks=[]; let size=0;
        for await(const chunk of req) { size+=chunk.length; if(size>65536) return json(res,413,{error:'Message too large.'}); chunks.push(chunk); }
        body=Buffer.concat(chunks);
      }
      if(active>=32) return json(res,503,{error:'Node connection busy. Retry shortly.'});
      active++;
      try {
        const upstream=new URL('/v1/'+endpoint,target); upstream.search=url.search;
        const headers={Accept:'application/json'};
        if(writing) headers['Content-Type']='application/octet-stream';
        if(options.rpcAuth) headers.Authorization='Basic '+Buffer.from(options.rpcAuth).toString('base64');
        const response=await fetch(upstream,{method:req.method,headers,body,redirect:'error',signal:AbortSignal.timeout(15000)});
        const chunks=[]; let size=0;
        for await(const chunk of response.body) { size+=chunk.length; if(size>8*1024*1024) throw new Error('Upstream response too large'); chunks.push(chunk); }
        res.writeHead(response.status,{...security,'Content-Type':'application/json','Cache-Control':'no-store'});
        res.end(Buffer.concat(chunks));
      } finally { active--; }
    } catch { if(!res.headersSent) json(res,502,{error:'Node unavailable. Check server logs and snapshot progress.'}); else res.end(); }
  });
  server.maxConnections=128;
  server.keepAliveTimeout=5000;
  server.requestTimeout=20000;
  server.headersTimeout=10000;
  return server;
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const server=createRelayServer({origin:process.env.PUBLIC_ORIGIN,loginHash:process.env.RELAY_LOGIN_HASH,publicAccess:process.env.RELAY_PUBLIC_CLIENT==='true',
    target:process.env.SNAPCHAIN_URL,directory:process.env.STATIC_DIR,rpcAuth:process.env.SNAPCHAIN_RPC_AUTH});
  server.listen(Number(process.env.PORT || 3080),'127.0.0.1',()=>console.log('Farcaster client service listening on loopback.'));
  for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>process.exit(0)));
}
