import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createServer as createViteServer } from 'vite';

const target = new URL(process.env.SNAPCHAIN_URL || 'http://127.0.0.1:13381');
if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('Use an HTTP(S) SNAPCHAIN_URL without embedded credentials.');
const port = Number(process.env.PORT || 5173);
const allowed = new Set(['info','events','storageLimitsByFid','castsByFid','castsByParent','userDataByFid','linksByFid','linkById','reactionsByFid','reactionsByCast','signer','signersByFid','onChainIdRegistryEventByAddress','submitMessage','validateMessage']);
const vite = await createViteServer({ server: { middlewareMode: true, ws: {port: port + 20000} }, optimizeDeps: {include: ['@farcaster/core', 'buffer/index.js', 'viem', 'viem/accounts']}, appType: 'spa' });
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
const server = http.createServer(async (req, res) => {
  try {
    // Bind locally and reject foreign hosts/origins, including DNS rebinding.
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return json(res, 403, { error: 'Local access only' });
    if (req.headers.origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(req.headers.origin)) return json(res, 403, { error: 'Foreign origin rejected' });
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/api/config') return json(res, 200, { nodeUrl: target.origin, transport: ['localhost','127.0.0.1','[::1]'].includes(target.hostname) ? 'Local connection / SSH tunnel' : 'Remote node' });
    if (url.pathname === '/setup') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(await readFile(new URL('../../SETUP.md', import.meta.url), 'utf8')); }
    if (!url.pathname.startsWith('/api/node/')) return vite.middlewares(req, res);
    const endpoint = url.pathname.slice('/api/node/'.length);
    if (!allowed.has(endpoint)) return json(res, 404, { error: 'Unsupported node endpoint' });
    const writing = ['submitMessage','validateMessage'].includes(endpoint);
    if (req.method !== (writing ? 'POST' : 'GET')) return json(res, 405, { error: 'Method not allowed' });
    if (writing && req.headers['content-type'] !== 'application/octet-stream') return json(res, 415, { error: 'Expected signed protobuf bytes' });
    let body;
    if (writing) { const chunks = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > 65536) return json(res, 413, { error: 'Message too large' }); chunks.push(chunk); } body = Buffer.concat(chunks); }
    const headers = { Accept: 'application/json' };
    if (writing) headers['Content-Type'] = 'application/octet-stream';
    if (process.env.SNAPCHAIN_RPC_AUTH) headers.Authorization = `Basic ${Buffer.from(process.env.SNAPCHAIN_RPC_AUTH).toString('base64')}`;
    const upstream = new URL(`/v1/${endpoint}`, target);
    upstream.search = url.search;
    const response = await fetch(upstream, { method: req.method, headers, body, signal: AbortSignal.timeout(15000), redirect: 'error' });
    res.writeHead(response.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(await response.text());
  } catch { json(res, 502, { error: 'Node unavailable. Check your SSH tunnel and snapshot progress.' }); }
});
server.listen(port, '127.0.0.1', () => console.log(`Relay: http://127.0.0.1:${port} · node ${target.origin}`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { server.close(); void vite.close().then(() => process.exit(0)); });
