import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/sdk-compat';
import { Message, MessageType, NobleEd25519Signer, ed25519 } from '@farcaster/core';
import { toHex, encodeAbiParameters } from 'viem';
import { castMessage, reactionMessage, followMessage, registerSigner, appFid, submit, revokeSigner } from '../src/signing';
import { filterCasts, loadFeed, mergeCasts, safeUrl, validFid, nodeGet, NodeError } from '../src/api';
import type { Cast, Session } from '../src/types';

const key = crypto.getRandomValues(new Uint8Array(32));
const signer = new NobleEd25519Signer(key);
const pub = await signer.getSignerKey();
if (pub.isErr()) throw pub.error;
const session:Session={fid:123,privateKey:key,publicKey:toHex(pub.value),requestFid:123};
const cast=(fid:number,timestamp:number,hash:string):Cast=>({hash,signer:session.publicKey,data:{fid,timestamp,castAddBody:{text:'test'}}});

test('signed casts/reactions/follows bind the mainnet FID and intended target',async()=>{
  const result=await castMessage(session,'hello');assert.ok(result.isOk());
  assert.equal(result.value.data?.fid,123);assert.equal(result.value.data?.network,1);
  assert.equal(result.value.data?.castAddBody?.text,'hello');
  assert.equal((await ed25519.verifyMessageHashSignature(result.value.signature,result.value.hash,pub.value))._unsafeUnwrap(),true);
  const roundtrip=Message.decode(Message.encode(result.value).finish());assert.equal(roundtrip.data?.castAddBody?.text,'hello');
  const target=cast(3,1,'0x'+'ab'.repeat(20));
  const reaction=await reactionMessage(session,target,'like');assert.ok(reaction.isOk());assert.equal(reaction.value.data?.reactionBody?.targetCastId?.fid,3);
  const unfollow=await followMessage(session,3,true);assert.ok(unfollow.isOk());assert.equal(unfollow.value.data?.type,MessageType.LINK_REMOVE);
  assert.throws(()=>castMessage(session,'😀'.repeat(81)),/320/);
  assert.throws(()=>validFid('1.5'));assert.equal(safeUrl('javascript:alert(1)'),undefined);
});

test('feed merges deduplicate and retain chronological order',()=>{
  assert.deepEqual(mergeCasts([cast(1,3,'a'),cast(2,8,'b'),cast(1,3,'a')]).map(c=>c.hash),['b','a']);
});

test('following feed reports partial failures instead of claiming an empty complete feed',async()=>{
  const previous=globalThis.fetch;
  globalThis.fetch=async(input)=>{
    const url=new URL(String(input),'http://localhost');
    if(url.pathname.endsWith('linksByFid'))return Response.json({messages:[{data:{linkBody:{targetFid:2}}}],nextPageToken:'next'});
    if(url.searchParams.get('fid')==='2')return Response.json({error:'unavailable'},{status:502});
    return Response.json({messages:[cast(1,8,'a')]});
  };
  try{const result=await loadFeed(1,'following');assert.equal(result.casts.length,1);assert.match(result.note,/1 account requests failed/);assert.equal(result.next,'next');}
  finally{globalThis.fetch=previous;}
});

test('app attribution handles gasless and base64 legacy metadata without guessing',()=>{
  assert.equal(appFid({source:'OFFCHAIN',key:'0x',requestFid:456}),456);
  const metadata=encodeAbiParameters([{type:'tuple',components:[{name:'requestFid',type:'uint256'},{name:'requestSigner',type:'address'},{name:'signature',type:'bytes'},{name:'deadline',type:'uint256'}]}],[{requestFid:789n,requestSigner:'0x'+'01'.repeat(20) as `0x${string}`,signature:'0x'+'02'.repeat(65) as `0x${string}`,deadline:9999999999n}]);
  assert.equal(appFid({source:'ONCHAIN',key:'0x',onChainEvent:{signerEventBody:{metadata:Buffer.from(metadata.slice(2),'hex').toString('base64')}}}),789);
  assert.equal(appFid({source:'ONCHAIN',key:'0x'}),null);
});

test('gasless registration reads current nonce and submits only signed bytes to configured node',async()=>{
  const previous=globalThis.fetch;let submitted:Message|undefined;
  globalThis.fetch=async(input,options)=>{
    const url=new URL(String(input),'http://localhost');
    if(url.pathname.endsWith('onChainIdRegistryEventByAddress'))return Response.json({fid:123});
    if(url.pathname.endsWith('storageLimitsByFid'))return Response.json({limits:[{name:'CASTS',limit:2000}]});
    if(url.pathname.endsWith('info'))return Response.json({shardInfos:[{shardId:0},{shardId:1}]});
    if(url.pathname.endsWith('events'))return Response.json({events:submitted?[{id:2,mergeMessageBody:{message:{hash:toHex(submitted.hash)}}}]:[{id:1}]});
    if(url.pathname.endsWith('signersByFid'))return Response.json({signers:[],currentUserNonce:8});
    if(url.pathname.endsWith('signer'))return submitted?Response.json({signer:{nonce:9}}):Response.json({error:'not found'},{status:404});
    if(url.pathname.endsWith('submitMessage')){assert.equal((options?.headers as Record<string,string>)['Content-Type'],'application/octet-stream');submitted=Message.decode(options?.body as Uint8Array);return Response.json({hash:'0xabc'});}
    throw new Error('Unexpected request');
  };
  try{
    // Public test vector, never use this account for real assets.
    const phrase=Array(11).fill('abandon').concat('about').join(' ');
    const result=await registerSigner(123,phrase);
    assert.equal(result.fid,123);assert.equal(submitted?.data?.type,MessageType.KEY_ADD);
    assert.equal(submitted?.data?.keyAddBody?.nonce,9);assert.equal(submitted?.data?.keyAddBody?.ttl,86400);
    assert.equal(submitted?.data?.keyAddBody?.scopes.includes(MessageType.KEY_REMOVE),false);
    assert.equal((await ed25519.verifyMessageHashSignature(submitted!.signature,submitted!.hash,submitted!.signer))._unsafeUnwrap(),true);
  }finally{globalThis.fetch=previous;}
});


test('feed ignores cast-removal records returned alongside cast-adds',()=>{
  const removal={hash:'removed',data:{fid:1,timestamp:99,castRemoveBody:{}}} as unknown as Cast;
  assert.deepEqual(mergeCasts([removal,cast(1,3,'kept')]).map(c=>c.hash),['kept']);
});

test('include and exclude client filters omit unknown attribution',()=>{
  const items=[cast(1,1,'a'),cast(2,2,'b'),cast(3,3,'unknown')];
  const apps={a:10,b:20,unknown:null};
  assert.deepEqual(filterCasts(items,apps,10,'include').map(c=>c.hash),['a']);
  assert.deepEqual(filterCasts(items,apps,10,'exclude').map(c=>c.hash),['b']);
  assert.equal(filterCasts(items,apps,null,'include').length,3);
});

for (const outcome of ['merge','pending','reject'] as const) test(`write confirmation: ${outcome}`,async()=>{
  const previous=globalThis.fetch;let relays=0, polls=0;const bodies:Uint8Array[]=[];
  const message=(await castMessage(session,'confirmation test'))._unsafeUnwrap();
  const hash=toHex(message.hash);
  globalThis.fetch=async(input,options)=>{
    const url=new URL(String(input),'http://localhost');
    if(url.pathname.endsWith('info'))return Response.json({shardInfos:[{shardId:0},{shardId:1}]});
    if(url.pathname.endsWith('submitMessage')){relays++;bodies.push(options?.body as Uint8Array);assert.ok(Message.decode(bodies.at(-1)!).dataBytes?.length);return Response.json({hash});}
    if(url.pathname.endsWith('events')){
      assert.notEqual(url.searchParams.get('shard_index'),'0','block shard does not serve message events');
      if(url.searchParams.get('reverse'))return Response.json({events:[{id:10}]});
      polls++;
      return Response.json({events:outcome==='merge'?[{id:11,mergeMessageBody:{message:{hash}}}]:outcome==='reject'?[{id:11,mergeFailureBody:{message:{hash},error:'invalid scope'}}]:[]});
    }
    throw new Error('Unexpected request');
  };
  try{
    if(outcome==='merge'){const result=await submit(message,{attempts:6,intervalMs:0});assert.equal(result.hash,hash);assert.equal(polls,1);}
    else await assert.rejects(submit(message,{attempts:6,intervalMs:0}),outcome==='reject'?/invalid scope/:/Confirmation pending/);
    assert.equal(relays,outcome==='pending'?2:1);
    if(bodies.length>1)assert.deepEqual(bodies[0],bodies[1]);
  } finally {globalThis.fetch=previous;}
});


test('node gRPC NotFound wrapped as HTTP 400 is distinct from validation failure',async()=>{
  const previous=globalThis.fetch;
  try{
    globalThis.fetch=async()=>Response.json({error:'Failed to get signer',error_detail:'status: NotFound, message: "Active signer not found"'},{status:400});
    await assert.rejects(nodeGet('signer'),e=>e instanceof NodeError&&e.notFound);
    globalThis.fetch=async()=>Response.json({error:'Invalid argument'},{status:400});
    await assert.rejects(nodeGet('signer'),e=>e instanceof NodeError&&!e.notFound);
  } finally {globalThis.fetch=previous;}
});


test('real API-shaped self-revocation uses array requester nonce and verifies disappearance',async()=>{
  const previous=globalThis.fetch;let removed=false;let submitted:Message|undefined;
  globalThis.fetch=async(input,options)=>{
    const url=new URL(String(input),'http://localhost');
    if(url.pathname.endsWith('signersByFid')){assert.equal(url.searchParams.get('requesterFids[]'),'123');assert.match(String(input),/requesterFids\[\]=123/);return Response.json({requesterFidNonces:{'123':4}});}
    if(url.pathname.endsWith('signer'))return removed?Response.json({error:'Failed to get signer',error_detail:'status: NotFound, message: "Active signer not found"'},{status:400}):Response.json({signer:{key:session.publicKey}});
    if(url.pathname.endsWith('info'))return Response.json({shardInfos:[{shardId:0},{shardId:1}]});
    if(url.pathname.endsWith('events')){assert.notEqual(url.searchParams.get('shard_index'),'0');return Response.json({events:[]});}
    if(url.pathname.endsWith('submitMessage')){submitted=Message.decode(options?.body as Uint8Array);removed=true;return Response.json({hash:'confirmed-revocation'});}
    throw new Error('Unexpected request');
  };
  try{const result=await revokeSigner(session);assert.equal(result.hash,'confirmed-revocation');assert.equal(submitted?.data?.type,MessageType.KEY_REMOVE);assert.equal(submitted?.data?.keyRemoveBody?.nonce,5);assert.equal(submitted?.data?.keyRemoveBody?.signatureType,2);}
  finally{globalThis.fetch=previous;}
});

test('plain-text API validation errors remain readable',async()=>{
  const previous=globalThis.fetch;globalThis.fetch=async()=>new Response('Invalid query parameters: expected a sequence',{status:400});
  try{await assert.rejects(nodeGet('signersByFid'),/expected a sequence/);}finally{globalThis.fetch=previous;}
});
