import './sdk-compat';
import { CastType, FarcasterNetwork, Message, MessageData, MessageType, NobleEd25519Signer, ReactionType, ViemLocalEip712Signer, ViemWalletEip712Signer, getFarcasterTime, makeCastAdd, makeKeyAdd, makeKeyAddBody, makeKeyRemove, makeKeyRemoveBodySelfRevoke, makeLinkAdd, makeLinkRemove, makeReactionAdd, makeReactionRemove, decodeGaslessSignedKeyRequestMetadata } from '@farcaster/core';
import type { Eip712Signer, HubAsyncResult } from '@farcaster/core';
import { createWalletClient, custom, fromHex, toHex, decodeAbiParameters } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { NodeError, nodeGet, validFid } from './api';
import type { Cast, Session, SignersResponse, SignerRecord } from './types';

const network = FarcasterNetwork.MAINNET;
const scopes = [MessageType.CAST_ADD, MessageType.REACTION_ADD, MessageType.REACTION_REMOVE, MessageType.LINK_ADD, MessageType.LINK_REMOVE];
const unwrap = <T>(result: {isErr(): boolean; value?: T; error?: unknown}): T => { if (result.isErr()) throw new Error(String(result.error)); return result.value as T; };
interface NodeEvent { id: number; type: string; mergeMessageBody?: {message: {hash: string}}; mergeFailureBody?: {message?: {hash: string}; error?: string} }
interface EventPage { events: NodeEvent[]; nextPageToken?: string }
export async function submit(result: HubAsyncResult<Message> | Message, options: {attempts?: number; intervalMs?: number} = {}) {
  const resolved = await result;
  const message: Message = 'isErr' in resolved ? unwrap(resolved) : resolved;
  if (!message.dataBytes?.length && message.data) message.dataBytes = MessageData.encode(message.data).finish();
  const data = message.data || MessageData.decode(message.dataBytes!);
  const keyBody = data.keyAddBody || data.keyRemoveBody;
  const keyParams = keyBody ? {fid: data.fid, signer: toHex(keyBody.key)} : null;
  if (data.type === MessageType.KEY_REMOVE && keyParams) await nodeGet('signer', keyParams);
  const hash = toHex(message.hash);
  const bytes = new Uint8Array(Message.encode(message).finish());
  // Capture message-shard cursors before relay. Shard 0 orders blocks but does not serve this events API.
  const info = await nodeGet<{shardInfos: {shardId: number}[]}>('info');
  const eventShards = info.shardInfos?.filter(shard => shard.shardId > 0) || [];
  if (!eventShards.length) throw new Error('Cannot confirm writes: node has no message-shard information.');
  const cursors = await Promise.all(eventShards.map(async ({shardId}) => {
    const page = await nodeGet<EventPage>('events', {shard_index: shardId, reverse: true, pageSize: 1});
    return {shardId, next: (page.events?.[0]?.id ?? 0) + 1};
  }));
  async function relay() {
    const response = await fetch('/api/node/submitMessage', {method: 'POST', headers: {'Content-Type': 'application/octet-stream'}, body: bytes});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || data.details || data.message || `Node rejected message (${response.status}).`);
    return data;
  }
  const accepted = await relay();
  const attempts = options.attempts ?? 15;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, options.intervalMs ?? 2000));
    // Gasless key state is maintained outside message-shard merge events on this release.
    if (keyParams) {
      try {
        const state = await nodeGet<{signer: SignerRecord & {nonce?: number}}>('signer', keyParams);
        if (data.type === MessageType.KEY_ADD && state.signer.nonce === data.keyAddBody!.nonce) return accepted;
      } catch (error) {
        if (error instanceof NodeError && error.notFound) {
          if (data.type === MessageType.KEY_REMOVE) return accepted;
        } else throw new Error(`Could not confirm signer state for ${hash}: ${(error as Error).message}`);
      }
    }
    for (const cursor of cursors) {
      // Bound work even if this node has a busy event stream.
      for (let pageIndex = 0; pageIndex < 4; pageIndex++) {
        const page = await nodeGet<EventPage>('events', {shard_index: cursor.shardId, from_event_id: cursor.next, pageSize: 250});
        for (const event of page.events || []) {
          cursor.next = Math.max(cursor.next, event.id + 1);
          if (event.mergeFailureBody?.message?.hash === hash) throw new Error(`Message was rejected during merge: ${event.mergeFailureBody.error || hash}`);
          if (event.mergeMessageBody?.message?.hash === hash) return accepted;
        }
        if ((page.events?.length ?? 0) < 250) break;
      }
    }
    // Re-gossip the identical signed bytes, never create a duplicate cast with a new timestamp.
    if (attempt === 4 || attempt === 9) { try { await relay(); } catch { /* A merge may race the resend; keep checking events. */ } }
  }
  throw new Error(`Confirmation pending for ${hash}. Your node accepted the message, but inclusion was not observed. Check the node before trying again.`);
}
export async function registerSigner(fid: number, phrase?: string): Promise<Session> {
  validFid(fid);
  let custody: Eip712Signer;
  let address: string;
  if (phrase) { const account = mnemonicToAccount(phrase.trim().toLowerCase().replace(/\s+/g,' ')); address = account.address; custody = new ViemLocalEip712Signer(account); }
  else {
    const provider = (window as unknown as {ethereum?: Parameters<typeof custom>[0]}).ethereum;
    if (!provider) throw new Error('No browser wallet found. Use a wallet extension holding the test FID custody account, or the test-account recovery option.');
    const wallet = createWalletClient({ transport: custom(provider) });
    const [account] = await wallet.requestAddresses();
    address = account;
    custody = new ViemWalletEip712Signer(createWalletClient({account, transport: custom(provider)}));
  }
  const event = await nodeGet<{fid: number}>('onChainIdRegistryEventByAddress', {address});
  if (event.fid !== fid) throw new Error(`That wallet controls FID ${event.fid}, not ${fid}. Choose its custody wallet.`);
  const storage = await nodeGet<{limits: {name: string; limit: number}[]}>('storageLimitsByFid', {fid});
  if (!storage.limits?.some(limit => limit.name === 'CASTS' && limit.limit > 0)) throw new Error('This account has no cast storage allowance. Rent storage before authorizing a posting key.');
  const key = crypto.getRandomValues(new Uint8Array(32));
  const signer = new NobleEd25519Signer(key);
  const publicKey = unwrap(await signer.getSignerKey());
  const state = await nodeGet<SignersResponse>('signersByFid', {fid});
  if (!Number.isInteger(state.currentUserNonce)) throw new Error('Node does not expose the gasless user nonce. Upgrade the node before authorization.');
  const body = unwrap(await makeKeyAddBody({fid: BigInt(fid), key: publicKey, scopes, ttl: 86400, nonce: state.currentUserNonce + 1, deadline: unwrap(getFarcasterTime()) + 3600}, custody));
  await submit(makeKeyAdd(body, {fid,network}, signer));
  return {fid,privateKey:key,publicKey:toHex(publicKey),requestFid:fid};
}
export async function importSigner(fid: number, value: string): Promise<Session> {
  validFid(fid);
  if (!/^(0x)?[a-fA-F0-9]{64}$/.test(value.trim())) throw new Error('Use a 32-byte Ed25519 app signer, not a wallet private key.');
  const key = fromHex(`0x${value.trim().replace(/^0x/,'')}`, 'bytes');
  const publicKey = toHex(unwrap(await new NobleEd25519Signer(key).getSignerKey()));
  const record = await nodeGet<{signer: SignerRecord}>('signer',{fid, signer: publicKey}).catch(error=>{if(error instanceof NodeError&&error.notFound)throw new Error('No active signer found for this FID. The key may be revoked, expired, or registered to another account.');throw error;});
  if (record.signer.expiresAt && record.signer.expiresAt * 1000 < Date.now()) throw new Error('This signer has expired.');
  return {fid,privateKey:key,publicKey,requestFid: appFid(record.signer) || fid};
}
export function castMessage(session: Session, text: string, parent?: Cast) {
  if (!text.trim()) throw new Error('Write something first.');
  if (new TextEncoder().encode(text).length > 320) throw new Error('Casts can contain at most 320 UTF-8 bytes.');
  return makeCastAdd({text, embeds:[], embedsDeprecated:[], mentions:[], mentionsPositions:[], type:CastType.CAST, ...(parent && {parentCastId:{fid:parent.data.fid,hash:fromHex(parent.hash as `0x${string}`,'bytes')}})}, {fid:session.fid,network}, new NobleEd25519Signer(session.privateKey));
}
export function reactionMessage(session: Session, cast: Cast, kind: 'like'|'recast', remove = false) {
  const body={type:kind==='like'?ReactionType.LIKE:ReactionType.RECAST,targetCastId:{fid:cast.data.fid,hash:fromHex(cast.hash as `0x${string}`,'bytes')}};
  return (remove ? makeReactionRemove : makeReactionAdd)(body,{fid:session.fid,network},new NobleEd25519Signer(session.privateKey));
}
export function followMessage(session: Session, targetFid: number, remove=false) {
  return (remove ? makeLinkRemove : makeLinkAdd)({type:'follow',targetFid:validFid(targetFid)},{fid:session.fid,network},new NobleEd25519Signer(session.privateKey));
}
export async function revokeSigner(session: Session) {
  const state = await nodeGet<SignersResponse>('signersByFid',{fid:session.fid, 'requesterFids[]':session.requestFid});
  const nonce=state.requesterFidNonces?.[String(session.requestFid)];
  if (!Number.isInteger(nonce)) throw new Error('Cannot read the app nonce for revocation.');
  const body=unwrap(makeKeyRemoveBodySelfRevoke({key:fromHex(session.publicKey as `0x${string}`,'bytes'),nonce:nonce!+1,deadline:unwrap(getFarcasterTime())+3600}));
  return submit(makeKeyRemove(body,{fid:session.fid,network},new NobleEd25519Signer(session.privateKey)));
}
export function appFid(record: SignerRecord): number | null {
  if (record.requestFid) return record.requestFid;
  const metadata=record.onChainEvent?.signerEventBody?.metadata;
  if (!metadata) return null;
  try {
    const bytes=metadata.startsWith('0x') ? fromHex(metadata as `0x${string}`,'bytes') : Uint8Array.from(atob(metadata),c=>c.charCodeAt(0));
    const decoded=decodeGaslessSignedKeyRequestMetadata(bytes);
    if (decoded.isOk()) return Number(decoded.value.requestFid);
    // Legacy onchain SignedKeyRequest metadata uses the same ABI tuple.
    const [result]=decodeAbiParameters([{type:'tuple',components:[{name:'requestFid',type:'uint256'},{name:'requestSigner',type:'address'},{name:'signature',type:'bytes'},{name:'deadline',type:'uint256'}]}],toHex(bytes));
    return Number(result.requestFid);
  } catch {return null;}
}
