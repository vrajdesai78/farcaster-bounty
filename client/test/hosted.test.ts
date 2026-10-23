import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRelayServer} from '../server/production.mjs';
const origin='https://relay.example.test';
const credential='relay:disposable-test-password';
const authorization='Basic '+Buffer.from(credential).toString('base64');
async function fixture(t:any,extra={}) {
  const directory=await mkdtemp(join(tmpdir(),'relay-hosted-'));
  await mkdir(join(directory,'assets'));
  await writeFile(join(directory,'index.html'),'<h1>Relay fixture</h1>');
  await writeFile(join(directory,'manifest.webmanifest'),JSON.stringify({name:'Farcaster client'}));
  await writeFile(join(directory,'sw.js'),'self.addEventListener("fetch",()=>{});');
  await writeFile(join(directory,'assets','app.js'),'console.log("fixture");');
  const seen:any[]=[];
  const upstream=http.createServer(async(req,res)=>{
    const parts=[];for await(const chunk of req)parts.push(chunk);
    seen.push({url:req.url,authorization:req.headers.authorization,body:Buffer.concat(parts)});
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({messages:[],version:'fixture'}));
  });
  await new Promise<void>(r=>upstream.listen(0,'127.0.0.1',r));
  const upstreamPort=(upstream.address() as any).port;
  const server=createRelayServer({origin,directory,target:`http://127.0.0.1:${upstreamPort}`,loginHash:createHash('sha256').update(credential).digest('hex'),...extra});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{server.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>upstream.close(r))]);await rm(directory,{recursive:true,force:true});});
  const port=(server.address() as any).port;
  const request=(path:string,options:any={})=>new Promise<Response>((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port,path,method:options.method || 'GET',headers:{Host:'relay.example.test',Authorization:authorization,...options.headers}},res=>{
      const chunks:Buffer[]=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers as Record<string,string>})));
    });
    req.on('error',reject);req.end(options.body);
  });
  return {request,seen};
}
test('hosted client requires login for HTML and API',async t=>{
  const {request}=await fixture(t);
  for(const path of ['/','/api/node/info','/api/config']){
    const res=await request(path,{headers:{Authorization:''}});assert.equal(res.status,401);assert.match(res.headers.get('www-authenticate')!,/Basic/);
  }
  const html=await request('/');assert.equal(html.status,200);assert.match(await html.text(),/Relay fixture/);
  assert.equal(html.headers.get('x-content-type-options'),'nosniff');
});
test('hosted config identifies same-server connection without leaking upstream credentials',async t=>{
  const {request}=await fixture(t,{rpcAuth:'fixture:rpc-secret'});
  const data=await (await request('/api/config')).json();
  assert.equal(data.mode,'hosted');assert.equal(data.nodeUrl,origin+'/api/node');assert.equal(JSON.stringify(data).includes('rpc-secret'),false);
});
test('foreign origins and unknown node methods cannot reach upstream',async t=>{
  const {request,seen}=await fixture(t);
  assert.equal((await request('/api/node/info',{headers:{Origin:'https://other.test'}})).status,403);
  assert.equal((await request('/api/node/info',{headers:{Host:'other.test'}})).status,403);
  assert.equal((await request('/api/node/mesh')).status,404);
  assert.equal((await request('/api/node/info',{method:'POST'})).status,405);assert.equal(seen.length,0);
});
test('read queries preserve literal nonce brackets and do not forward login credentials',async t=>{
  const {request,seen}=await fixture(t);
  assert.equal((await request('/api/node/signersByFid?fid=123&requesterFids[]=123')).status,200);
  assert.equal(seen[0].url,'/v1/signersByFid?fid=123&requesterFids[]=123');assert.equal(seen[0].authorization,undefined);
});
test('signed writes require same origin, binary content and a bounded body',async t=>{
  const {request,seen}=await fixture(t);
  const post={method:'POST',headers:{Origin:origin,'Content-Type':'application/octet-stream'}};
  assert.equal((await request('/api/node/submitMessage',{method:'POST',body:'x'})).status,403);
  assert.equal((await request('/api/node/submitMessage',{method:'POST',headers:{Origin:origin,'Content-Type':'text/plain'},body:'x'})).status,415);
  assert.equal((await request('/api/node/submitMessage',{...post,body:Buffer.alloc(65537)})).status,413);
  const body=Buffer.from([1,2,3]);assert.equal((await request('/api/node/submitMessage',{...post,body})).status,200);
  assert.equal(seen.length,1);assert.deepEqual(seen[0].body,body);
});
test('API and write rate limits return retry guidance',async t=>{
  const {request}=await fixture(t,{readLimit:2});
  assert.equal((await request('/api/node/info')).status,200);assert.equal((await request('/api/node/info')).status,200);
  const res=await request('/api/node/info');assert.equal(res.status,429);assert.equal(res.headers.get('retry-after'),'60');
  const other=await fixture(t,{writeLimit:1});
  const post={method:'POST',headers:{Origin:origin,'Content-Type':'application/octet-stream'},body:Buffer.from([1])};
  assert.equal((await other.request('/api/node/submitMessage',post)).status,200);assert.equal((await other.request('/api/node/submitMessage',post)).status,429);
});
test('private files, directories and oversized API pages are not served',async t=>{
  const {request,seen}=await fixture(t);
  for(const path of ['/.env','/server/production.mjs','/assets/.env','/assets/','/api/node/info?pageSize=251'])assert.ok((await request(path)).status>=400,path);
  assert.equal(seen.length,0);
  const asset=await request('/assets/app.js');assert.equal(asset.status,200);assert.match(asset.headers.get('cache-control')!,/private/);
});
test('hosted service rejects insecure origins and missing login at startup',()=>{
  assert.throws(()=>createRelayServer({origin:'http://relay.test',loginHash:'a'.repeat(64)}),/HTTPS/);
  assert.throws(()=>createRelayServer({origin,loginHash:''}),/LOGIN_HASH/);
});

test('installation metadata is public but HTML and social data stay authenticated',async t=>{
  const {request,seen}=await fixture(t);
  for(const path of ['/manifest.webmanifest','/sw.js']){
    const response=await request(path,{headers:{Authorization:''}});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
  }
  assert.match((await request('/manifest.webmanifest',{headers:{Authorization:''}})).headers.get('content-type')!,/manifest/);
  assert.equal((await request('/',{headers:{Authorization:''}})).status,401);
  assert.equal((await request('/api/node/castById?fid=2&hash=0xabc',{headers:{Authorization:''}})).status,401);
  assert.equal(seen.length,0);
});
test('conversation requests use only the configured node',async t=>{
  const {request,seen}=await fixture(t);
  const hash='0x'+'ab'.repeat(20);
  assert.equal((await request('/api/node/castById?fid=2&hash='+hash)).status,200);
  assert.equal(seen[0].url,'/v1/castById?fid=2&hash='+hash);
  assert.equal(seen[0].authorization,undefined);
});
