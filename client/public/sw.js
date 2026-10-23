// Network only: never persist account data, signing keys, authenticated pages or API responses.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Farcaster client — offline</title><body><main><h1>You’re offline</h1><p>Connect to the internet, then reopen your Farcaster client. Your node needs a connection to read and confirm posts.</p><p>No posts or signing keys are saved by this offline screen.</p></main></body></html>`, {status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})));
});
