export interface Cast {
  hash: string; signer: string;
  data: { fid: number; timestamp: number; castAddBody: { text: string; parentCastId?: { fid: number; hash: string }; embeds?: { url?: string }[] } };
}
export interface Page<T> { messages: T[]; nextPageToken?: string }
export interface Profile { fid: number; name: string; username: string; bio: string; pfp: string }
export interface Shard { shardId: number; maxHeight: number; blockDelay: number; approxSize: number }
export interface NodeInfo { version: string; shardInfos: Shard[]; dbStats?: { numMessages: number; approxSize: number } }
export interface SignerRecord { source: string; key: string; requestFid?: number; scopes?: string[]; expiresAt?: number; onChainEvent?: { signerEventBody?: { metadata: string } } }
export interface SignersResponse { signers: SignerRecord[]; currentUserNonce: number; requesterFidNonces?: Record<string, number>; nextPageToken?: string }
export interface Session { fid: number; privateKey: Uint8Array; publicKey: string; requestFid: number }
