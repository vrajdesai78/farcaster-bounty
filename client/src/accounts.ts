import './sdk-compat';
import { ID_GATEWAY_ADDRESS, idGatewayABI, ID_REGISTRY_ADDRESS, idRegistryABI } from '@farcaster/core';
import { createPublicClient, createWalletClient, custom, getAddress, http, isAddress, zeroAddress, type Address, type Hash } from 'viem';
import { optimism } from 'viem/chains';
import { publicActionsL2 } from 'viem/op-stack';
import { mnemonicToAccount } from 'viem/accounts';
import { validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { nodeGet, validFid } from './api';

const chain = createPublicClient({chain:optimism,transport:http('https://mainnet.optimism.io',{timeout:15000,retryCount:1})}).extend(publicActionsL2());
export interface WalletIdentity {address:Address;fid:number|null}
export interface RegistrationQuote {address:Address;recovery:Address;fid:number|null;balance:bigint;price:bigint;fee:bigint|null;checkedAt:number}
export function recoveryAddress(value:string):Address {
  if (!value.trim()) return zeroAddress;
  if (!isAddress(value.trim())) throw new Error('Enter a valid recovery wallet address, or leave it empty.');
  return getAddress(value.trim());
}
function provider() {
  const ethereum=(window as unknown as {ethereum?:Parameters<typeof custom>[0]}).ethereum;
  if(!ethereum)throw new Error('No wallet found. Open this site in your wallet’s browser or use a browser wallet extension.');
  return ethereum;
}
export async function walletAddress():Promise<Address> {
  const [address]=await createWalletClient({transport:custom(provider())}).requestAddresses();
  if(!address)throw new Error('The wallet did not share an address. Try connecting again.');
  return getAddress(address);
}
export function phraseAddress(phrase:string):Address {
  const normalized=phrase.trim().toLowerCase().replace(/\s+/g,' ');
  if(!validateMnemonic(normalized,wordlist))throw new Error('Check the English recovery phrase: words, order and checksum must match.');
  return mnemonicToAccount(normalized).address;
}
export async function identity(address:Address):Promise<WalletIdentity> {
  try {const result=await nodeGet<{fid:number}>('onChainIdRegistryEventByAddress',{address});return {address,fid:validFid(result.fid)};}
  catch(error) { if(error instanceof Error && 'notFound' in error && error.notFound)return {address,fid:null};throw error; }
}
export async function registrationQuote(address:Address,recovery:Address):Promise<RegistrationQuote> {
  if(await chain.getChainId()!==10)throw new Error('Registration RPC is not OP Mainnet. No transaction was sent.');
  const [balance,price,fid]=await Promise.all([
    chain.getBalance({address}),
    chain.readContract({address:ID_GATEWAY_ADDRESS,abi:idGatewayABI,functionName:'price'}),
    chain.readContract({address:ID_REGISTRY_ADDRESS,abi:idRegistryABI,functionName:'idOf',args:[address]})
  ]);
  // Estimate fees only once the account can cover the contract value. Include OP L1 and L2 fees.
  const fee=fid===0n && balance>price ? await chain.estimateContractTotalFee({account:address,address:ID_GATEWAY_ADDRESS,abi:idGatewayABI,functionName:'register',args:[recovery],value:price}) : null;
  return {address,recovery,fid:fid>0n?validFid(Number(fid)):null,balance,price,fee,checkedAt:Date.now()};
}
export function registrationReady(quote:RegistrationQuote):boolean {
  return !quote.fid && quote.fee!==null && quote.balance>=quote.price+quote.fee*2n;
}
export function assertReviewedRegistration(reviewed:RegistrationQuote,current:RegistrationQuote) {
  if(reviewed.address.toLowerCase()!==current.address.toLowerCase()||reviewed.recovery.toLowerCase()!==current.recovery.toLowerCase())throw new Error('Wallet or recovery address changed. Review registration again.');
  if(Date.now()-reviewed.checkedAt>5*60*1000)throw new Error('This quote expired. Refresh the cost before registering.');
  if(current.price>reviewed.price)throw new Error('Registration price increased. Refresh and review the new cost.');
  if(current.fee===null||reviewed.fee===null||current.fee>reviewed.fee*2n)throw new Error('Network fee changed. Refresh and review the cost.');
  if(!registrationReady(current))throw new Error('Add ETH on OP Mainnet for registration and network fees, then refresh the balance.');
}
// Public pending-transaction metadata only. No wallet secret or app key is persisted.
const memory=new Map<string,Hash>();
function pendingKey(address:Address){return 'farcaster-registration-op-'+address.toLowerCase();}
export const pendingRegistrations={
  get(address:Address):Hash|null {let value=memory.get(pendingKey(address));try {value ||= localStorage.getItem(pendingKey(address)) as Hash|null||undefined;}catch{/* Storage may be disabled. */}return value&&/^0x[0-9a-f]{64}$/i.test(value)?value:null;},
  set(address:Address,hash:Hash){memory.set(pendingKey(address),hash);try{localStorage.setItem(pendingKey(address),hash);}catch{/* Keep the in-memory guard. */}},
  clear(address:Address){memory.delete(pendingKey(address));try{localStorage.removeItem(pendingKey(address));}catch{/* Storage may be disabled. */}}
};
export interface RegistrationDependencies {
  quote:typeof registrationQuote;
  send:(quote:RegistrationQuote)=>Promise<Hash>;
  receipt:(hash:Hash,replaced:(hash:Hash)=>void)=>Promise<boolean>;
  fid:(address:Address)=>Promise<number>;
  pending:typeof pendingRegistrations;
}
const defaults:RegistrationDependencies={
  quote:registrationQuote,
  async send(quote){
    const wallet=createWalletClient({chain:optimism,transport:custom(provider())});
    const [address]=await wallet.getAddresses();
    if(!address||address.toLowerCase()!==quote.address.toLowerCase())throw new Error('The connected wallet changed. Connect and review again.');
    await wallet.switchChain({id:10});
    // Simulate immediately before prompting the wallet. Only IdGateway.register is permitted here.
    await chain.simulateContract({account:quote.address,address:ID_GATEWAY_ADDRESS,abi:idGatewayABI,functionName:'register',args:[quote.recovery],value:quote.price});
    const [active]=await wallet.getAddresses();
    if(active?.toLowerCase()!==quote.address.toLowerCase()||await wallet.getChainId()!==10)throw new Error('Wallet or network changed. No registration was sent.');
    return wallet.writeContract({account:quote.address,chain:optimism,address:ID_GATEWAY_ADDRESS,abi:idGatewayABI,functionName:'register',args:[quote.recovery],value:quote.price});
  },
  async receipt(hash,replaced){let cancelled=false;const receipt=await chain.waitForTransactionReceipt({hash,timeout:120000,onReplaced:({reason,transaction})=>{cancelled=reason==='cancelled';replaced(transaction.hash);}});return !cancelled&&receipt.status==='success';},
  async fid(address){return Number(await chain.readContract({address:ID_REGISTRY_ADDRESS,abi:idRegistryABI,functionName:'idOf',args:[address]}));},
  pending:pendingRegistrations
};
export async function registerAccount(reviewed:RegistrationQuote,onHash:(hash:Hash)=>void,deps:RegistrationDependencies=defaults):Promise<number> {
  let hash=deps.pending.get(reviewed.address);
  if(!hash){
    const current=await deps.quote(reviewed.address,reviewed.recovery);
    if(current.fid)return current.fid; // Already registered, including a previous attempt; never pay twice.
    assertReviewedRegistration(reviewed,current);
    hash=await deps.send(current);
    deps.pending.set(reviewed.address,hash);
  }
  onHash(hash);
  const success=await deps.receipt(hash,replacement=>{deps.pending.set(reviewed.address,replacement);onHash(replacement);});
  if(!success){deps.pending.clear(reviewed.address);throw new Error('Registration reverted or was cancelled. Check the transaction before trying again.');}
  const fid=await deps.fid(reviewed.address);
  if(!Number.isSafeInteger(fid)||fid<=0){deps.pending.clear(reviewed.address);throw new Error('The transaction confirmed but no FID was found. Refresh the account before registering again.');}
  deps.pending.clear(reviewed.address);
  return fid;
}
