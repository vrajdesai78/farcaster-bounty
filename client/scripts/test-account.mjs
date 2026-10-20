// Run from client/: npm run test-account -- status
// Secrets stay in the ignored deployment directory; never print the saved record.
import '../src/sdk-compat.ts';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createPublicClient,createWalletClient,http,formatEther,parseEther,zeroAddress} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {optimism} from 'viem/chains';
import {ID_GATEWAY_ADDRESS,idGatewayABI,ID_REGISTRY_ADDRESS,idRegistryABI} from '@farcaster/core';
const mode=process.argv[2]||'status';
if(!['status','register'].includes(mode))throw new Error('Use status or register --confirm-paid-registration.');
const file=new URL('../../.snapchain-aws/test-account.json',import.meta.url);
await mkdir(new URL('../../.snapchain-aws/',import.meta.url),{recursive:true,mode:0o700});
let saved;
try{saved=JSON.parse(await readFile(file,'utf8'));}catch(error){
  if(error.code!=='ENOENT')throw new Error('Cannot read the test wallet; refusing to replace it.');
  const privateKey=generatePrivateKey();saved={purpose:'Disposable Farcaster client testing only',createdAt:new Date().toISOString(),chainId:10,address:privateKeyToAccount(privateKey).address,privateKey};
  await writeFile(file,JSON.stringify(saved,null,2)+'\n',{flag:'wx',mode:0o600});
}
const account=privateKeyToAccount(saved.privateKey);
if(account.address.toLowerCase()!==saved.address.toLowerCase()||saved.chainId!==10)throw new Error('Saved test wallet metadata does not match.');
const transport=http('https://mainnet.optimism.io',{timeout:15000,retryCount:1});
const chain=createPublicClient({chain:optimism,transport});
if(await chain.getChainId()!==10)throw new Error('Expected OP Mainnet (chain 10).');
const [price,balance,fid]=await Promise.all([
  chain.readContract({address:ID_GATEWAY_ADDRESS,abi:idGatewayABI,functionName:'price'}),
  chain.getBalance({address:account.address}),
  chain.readContract({address:ID_REGISTRY_ADDRESS,abi:idRegistryABI,functionName:'idOf',args:[account.address]})
]);
console.log(JSON.stringify({network:'OP Mainnet',chainId:10,address:account.address,balanceEth:formatEther(balance),existingFid:fid.toString(),registrationEth:formatEther(price),note:'Registration price includes initial storage; network fees are additional. Recheck before funding.'},null,2));
if(mode==='register'&&fid===0n){
  if(!process.argv.includes('--confirm-paid-registration'))throw new Error('Review status first, then explicitly pass --confirm-paid-registration.');
  if(price>parseEther('0.0001'))throw new Error('Price exceeds the 0.0001 ETH registration-value cap. Recheck before changing this cap.');
  if(balance<=price)throw new Error('Fund this disposable address with ETH on OP Mainnet to cover registration plus transaction fees.');
  const {request}=await chain.simulateContract({account,address:ID_GATEWAY_ADDRESS,abi:idGatewayABI,functionName:'register',args:[zeroAddress],value:price});
  const wallet=createWalletClient({account,chain:optimism,transport});
  const hash=await wallet.writeContract(request);
  console.log(JSON.stringify({registrationTransaction:hash}));
  const receipt=await chain.waitForTransactionReceipt({hash});
  if(receipt.status!=='success')throw new Error('Registration transaction reverted.');
  const registered=await chain.readContract({address:ID_REGISTRY_ADDRESS,abi:idRegistryABI,functionName:'idOf',args:[account.address]});
  saved.fid=registered.toString();saved.registrationTransaction=hash;await writeFile(file,JSON.stringify(saved,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({fid:registered.toString(),status:'Registered on OP Mainnet. Wait for your Snapchain node to observe the account before authorizing its signer.'}));
}
