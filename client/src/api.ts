import type { Cast, Page, Profile, SignerRecord } from './types';

export function validFid(value: string | number): number {
  const fid = Number(value);
  if (!Number.isSafeInteger(fid) || fid <= 0) throw new Error('Enter a positive numeric FID.');
  return fid;
}
export class NodeError extends Error {
  constructor(message: string, public status: number, public notFound = status === 404) { super(message); }
}
export async function nodeGet<T>(endpoint: string, params: Record<string, string | number | boolean> = {}, signal?: AbortSignal): Promise<T> {
  // This node's strict query parser requires literal brackets for array keys.
  const query = new URLSearchParams(Object.entries(params).map(([k,v]) => [k, String(v)])).toString().replace(/%5B%5D=/g, '[]=');
  const response = await fetch(`/api/node/${endpoint}?${query}`, { signal });
  let data;
  const text = await response.text();
  try { data = JSON.parse(text); } catch {
    if (!response.ok) throw new NodeError(text.slice(0,240) || `Node returned ${response.status}.`, response.status);
    throw new Error(`Node returned an unreadable response (${response.status}).`);
  }
  if (!response.ok) throw new NodeError(data.error || data.details || data.message || `Node returned ${response.status}.`, response.status, response.status === 404 || /status: NotFound,/.test(data.error_detail || ''));
  return data;
}
export async function loadProfile(fid: number, signal?: AbortSignal): Promise<Profile> {
  const result = await nodeGet<Page<{data: {userDataBody: {type: string | number; value: string}}}>>('userDataByFid', { fid }, signal);
  const fields = new Map((result.messages || []).map(m => [String(m.data.userDataBody.type), m.data.userDataBody.value]));
  const field = (n: number, name: string) => fields.get(String(n)) || fields.get(`USER_DATA_TYPE_${name}`) || '';
  return { fid, name: field(2,'DISPLAY') || `FID ${fid}`, username: field(6,'USERNAME'), bio: field(3,'BIO'), pfp: field(1,'PFP') };
}
export async function mapLimited<T,R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) { const i = next++; results[i] = await fn(items[i]); } }));
  return results;
}
export function isCast(value: Cast): boolean {
  return !!value?.data?.castAddBody && typeof value.data.castAddBody.text === 'string';
}
export function filterCasts(casts: Cast[], apps: Record<string, number | null>, app: number | null, mode: 'include' | 'exclude') {
  if (app === null) return casts;
  // Unknown attribution is never guessed into either result set.
  return casts.filter(c => apps[c.hash] != null && (mode === 'include' ? apps[c.hash] === app : apps[c.hash] !== app));
}
export function mergeCasts(casts: Cast[]): Cast[] {
  return [...new Map(casts.filter(isCast).map(c => [c.hash,c])).values()].sort((a,b) => b.data.timestamp - a.data.timestamp);
}
export async function loadFeed(fid: number, mode: 'following' | 'fid', token = '', signal?: AbortSignal) {
  if (mode === 'fid') { const page = await nodeGet<Page<Cast>>('castsByFid', { fid, pageSize: 30, reverse: true, ...(token && { pageToken: token }) }, signal); return { casts: mergeCasts(page.messages || []), next: page.nextPageToken || '', note: '' }; }
  const links = await nodeGet<Page<{data: {linkBody: {targetFid: number}}}>>('linksByFid', { fid, link_type: 'follow', pageSize: 50, ...(token && {pageToken: token}) }, signal);
  const authors = [...new Set([fid, ...links.messages.map(m => m.data.linkBody.targetFid)])];
  const pages = await mapLimited(authors, 6, async author => {
    try { return {page: await nodeGet<Page<Cast>>('castsByFid', {fid: author, pageSize: 15, reverse: true}, signal), failed: false}; }
    catch(e) { if (signal?.aborted) throw e; return {page: {messages: [] as Cast[]}, failed: true}; }
  });
  const failed = pages.filter(p=>p.failed).length;
  if (failed === authors.length) throw new Error('Could not load casts for any followed account. Check your node.');
  return { casts: mergeCasts(pages.flatMap(p=>p.page.messages)), next: links.nextPageToken || '', note: `Latest 15 casts per account, ${authors.length} accounts in this batch.${failed ? ` ${failed} account requests failed; reload to retry.` : ''}${links.nextPageToken ? ' Load more to include more follows.' : ''}` };
}
export const signerCache = new Map<string, Promise<SignerRecord | null>>();
export function lookupSigner(fid: number, signer: string) {
  const key = `${fid}:${signer}`;
  if (!signerCache.has(key)) signerCache.set(key, nodeGet<{signer: SignerRecord}>('signer',{fid,signer}).then(r=>r.signer).catch(()=>{signerCache.delete(key); return null;}));
  return signerCache.get(key)!;
}
export function safeUrl(value: string) { try { const u=new URL(value); return ['http:','https:'].includes(u.protocol) ? u.href : undefined; } catch { return undefined; } }
