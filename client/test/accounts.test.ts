import test from 'node:test';
import assert from 'node:assert/strict';
import {zeroAddress,type Hash} from 'viem';
import {phraseAddress,recoveryAddress,registrationReady,assertReviewedRegistration,registerAccount,type RegistrationQuote,type RegistrationDependencies} from '../src/accounts';
const address='0x1111111111111111111111111111111111111111' as const;
const hash=('0x'+'ab'.repeat(32)) as Hash;
const fresh=():RegistrationQuote=>({address,recovery:zeroAddress,fid:null,balance:1000n,price:100n,fee:10n,checkedAt:Date.now()});
function dependencies(overrides:Partial<RegistrationDependencies>={}){
 let sent=0,waiting:Hash|null=null;
 const deps:RegistrationDependencies={quote:async()=>fresh(),send:async()=>{sent++;return hash;},receipt:async()=>true,fid:async()=>123,pending:{get:()=>waiting,set:(_,tx)=>{waiting=tx;},clear:()=>{waiting=null;}},...overrides};
 return {deps,sent:()=>sent,pending:()=>waiting};
}
test('phrase import validates checksum, normalizes whitespace and uses the documented first account',()=>{
 const publicVector=Array(11).fill('abandon').concat('about').join(' ');
 assert.equal(phraseAddress('  '+publicVector.toUpperCase().replaceAll(' ','  ')+'  '),'0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
 assert.throws(()=>phraseAddress(Array(12).fill('abandon').join(' ')),/checksum/);
 assert.throws(()=>phraseAddress('not a phrase'),/checksum/);
});
test('optional recovery and funding readiness are explicit',()=>{
 assert.equal(recoveryAddress(''),zeroAddress);assert.equal(recoveryAddress(address),address);
 assert.throws(()=>recoveryAddress('invalid'),/valid recovery/);
 assert.equal(registrationReady(fresh()),true);
 assert.equal(registrationReady({...fresh(),balance:119n}),false);
 assert.equal(registrationReady({...fresh(),fee:null}),false);
 assert.equal(registrationReady({...fresh(),fid:12}),false);
});
for(const [name,change] of Object.entries({price:{price:101n},fees:{fee:21n},funds:{balance:101n},wallet:{address:'0x2222222222222222222222222222222222222222'},recovery:{recovery:address}}))test(`registration blocks changed ${name} before any wallet transaction`,async()=>{
 const {deps,sent}=dependencies({quote:async()=>({...fresh(),...change} as RegistrationQuote)});
 await assert.rejects(registerAccount(fresh(),()=>{},deps));assert.equal(sent(),0);
});
test('expired quote cannot trigger payment',async()=>{const {deps,sent}=dependencies();await assert.rejects(registerAccount({...fresh(),checkedAt:Date.now()-300001},()=>{},deps),/expired/);assert.equal(sent(),0);});
test('an existing FID is reused without payment',async()=>{const {deps,sent}=dependencies({quote:async()=>({...fresh(),fid:123})});assert.equal(await registerAccount(fresh(),()=>{},deps),123);assert.equal(sent(),0);});
test('new registration returns the confirmed FID and clears only its public pending transaction',async()=>{const {deps,sent,pending}=dependencies();let displayed:Hash|undefined;assert.equal(await registerAccount(fresh(),tx=>{displayed=tx;},deps),123);assert.equal(sent(),1);assert.equal(displayed,hash);assert.equal(pending(),null);});
test('pending transaction survives timeout and retry waits instead of paying twice',async()=>{
 const state=dependencies({receipt:async()=>{throw new Error('timeout');}});
 await assert.rejects(registerAccount(fresh(),()=>{},state.deps),/timeout/);assert.equal(state.pending(),hash);assert.equal(state.sent(),1);
 state.deps.receipt=async()=>true;
 assert.equal(await registerAccount({...fresh(),checkedAt:0,balance:0n},()=>{},state.deps),123);assert.equal(state.sent(),1);assert.equal(state.pending(),null);
});
test('reverted receipt clears the pending marker without claiming account creation',async()=>{const {deps,pending}=dependencies({receipt:async()=>false});await assert.rejects(registerAccount(fresh(),()=>{},deps),/reverted/);assert.equal(pending(),null);});


test('confirmed replacement without a registration does not strand the pending marker',async()=>{const {deps,pending}=dependencies({fid:async()=>0});await assert.rejects(registerAccount(fresh(),()=>{},deps),/no FID/);assert.equal(pending(),null);});
test('replacement hash is recorded before confirmation continues',async()=>{const replacement=('0x'+'cd'.repeat(32)) as Hash;let displayed:Hash|undefined;const {deps}=dependencies({receipt:async(_,replace)=>{replace(replacement);return true;}});assert.equal(await registerAccount(fresh(),tx=>{displayed=tx;},deps),123);assert.equal(displayed,replacement);});
