import { useEffect, useRef, useState } from 'react';
import { X, KeyRound, Wallet, ArrowLeft, Copy, Check } from 'lucide-react';
import { formatEther, zeroAddress, type Hash } from 'viem';
import type { WalletIdentity, RegistrationQuote } from '../accounts';
import type { Session } from '../types';

type Path='choose'|'existing'|'phrase'|'create';
export default function SignerDialog({close,connected}:{close:()=>void;connected:(session:Session)=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [path,setPath]=useState<Path>('choose'),[account,setAccount]=useState<WalletIdentity|null>(null);
  const [phrase,setPhrase]=useState(''),[reveal,setReveal]=useState(false),[ack,setAck]=useState(false);
  const [busy,setBusy]=useState(false),[stage,setStage]=useState(''),[error,setError]=useState('');
  const [quote,setQuote]=useState<RegistrationQuote|null>(null),[recovery,setRecovery]=useState(''),[paidAck,setPaidAck]=useState(false);
  const [hash,setHash]=useState<Hash|null>(null),[pending,setPending]=useState(false),[copied,setCopied]=useState(false);
  useEffect(()=>{const el=dialog.current!;el.showModal();return()=>el.close();},[]);
  function navigate(next:Path){setPath(next);setAccount(null);setPhrase('');setReveal(false);setAck(false);setQuote(null);setError('');setHash(null);setPending(false);setCopied(false);setStage('');setPaidAck(false);setRecovery('');}
  async function action(task:()=>Promise<void>){setBusy(true);setError('');try{await task();}catch(e){setStage('');setError(e instanceof Error?((e as {shortMessage?:string}).shortMessage||e.message):'Could not continue. Try again.');}finally{setBusy(false);}}
  async function connectWallet(){await action(async()=>{
    setStage('Waiting for your wallet…');const api=await import('../accounts');const address=await api.walletAddress();
    if(path==='create'){
      setAccount({address,fid:null});const tx=api.pendingRegistrations.get(address);setHash(tx);setPending(!!tx);const next=await api.registrationQuote(address,api.recoveryAddress(recovery));setQuote(next);setAccount({address,fid:next.fid});
    }else {setStage('Finding your Farcaster account…');setAccount(await api.identity(address));}
    setStage('');
  });}
  async function detectPhrase(){await action(async()=>{
    const api=await import('../accounts');const address=api.phraseAddress(phrase);setStage('Finding your Farcaster account…');setAccount(await api.identity(address));setStage('');
  });}
  async function authorize(){if(!account?.fid)return;await action(async()=>{
    setStage(path==='phrase'?'Registering your gasless app key…':'Approve the two gasless signatures in your wallet…');
    const signing=await import('../signing');const session=await signing.registerSigner(account.fid!,path==='phrase'?phrase:undefined,account.address);
    setPhrase('');connected(session);
  });}
  async function refresh(){if(!account)return;await action(async()=>{
    const api=await import('../accounts');const next=await api.registrationQuote(account.address,api.recoveryAddress(recovery));setQuote(next);setPaidAck(false);if(next.fid)setAccount({...account,fid:next.fid});
  });}
  async function register(){if(!quote||(!paidAck&&!pending)||((recovery.trim()||zeroAddress).toLowerCase()!==quote.recovery.toLowerCase()&&!pending))return;await action(async()=>{
    setStage('Approve registration on OP Mainnet in your wallet…');const api=await import('../accounts');
    let fid:number;try{fid=await api.registerAccount(quote,tx=>{setHash(tx);setPending(true);setStage('Waiting for the OP Mainnet transaction…');});}finally{setPending(!!api.pendingRegistrations.get(quote.address));setPaidAck(false);}
    setAccount({address:quote.address,fid});setQuote(null);setStage('Account created. Next, authorize a gasless app key.');
  });}
  const recoveryDirty=!!quote&&(recovery.trim()||zeroAddress).toLowerCase()!==quote.recovery.toLowerCase();
  const ready=quote&&!recoveryDirty&&!quote.fid&&quote.fee!==null&&quote.balance>=quote.price+quote.fee*2n;
  return <dialog ref={dialog} onCancel={e=>{if(busy)e.preventDefault();else close();}} className="signer-dialog onboarding" aria-labelledby="signer-title">
    <div className="dialog-header"><span className="dialog-icon"><KeyRound size={22}/></span><button className="icon-button" aria-label="Close account setup" onClick={close} disabled={busy}><X size={20}/></button></div>
    {path!=='choose'&&<button className="text-button onboarding-back" onClick={()=>navigate('choose')} disabled={busy}><ArrowLeft size={15}/> Back</button>}
    <h2 id="signer-title">{path==='choose'?'Your Farcaster account':path==='create'?'Create a Farcaster account':path==='phrase'?'Import a recovery phrase':'Use your existing account'}</h2>
    {path==='choose'?<><p>Connect an account you already use, or create one with ETH on Optimism. Your feed comes from this server’s Snapchain node.</p><div className="account-choices"><button className="secondary" onClick={()=>navigate('existing')}><Wallet size={18}/> Use an existing account</button><button className="primary" onClick={()=>navigate('create')}>Create a new account</button></div><p className="fine-print">Reading needs no account. Posting uses a separate gasless app key that stays in memory on this device.</p></>:<>
      {path==='existing'&&<><p>Connect the wallet that owns your Farcaster account. We’ll find its FID automatically, then ask you to approve a new gasless app key.</p><p className="fine-print">Use a wallet extension or open this site in your wallet’s browser. Your Farcaster username alone cannot authorize posting.</p>{!account&&<><button className="primary full" onClick={()=>void connectWallet()} disabled={busy}><Wallet size={16}/> Connect wallet</button><button className="text-button phrase-option" disabled={busy} onClick={()=>navigate('phrase')}>Import an existing recovery phrase instead</button></>}</>}
      {path==='phrase'&&!account&&<form onSubmit={e=>{e.preventDefault();void detectPhrase();}}><p>The phrase is processed in this browser. It is not uploaded or saved. It controls the wallet and its funds; enter it only if you trust this site and device.</p><label>Recovery phrase (English)<input type={reveal?'text':'password'} required autoComplete="off" autoCapitalize="none" spellCheck={false} value={phrase} onChange={e=>setPhrase(e.target.value)} disabled={busy} /></label><button type="button" className="text-button" onClick={()=>setReveal(!reveal)} disabled={busy}>{reveal?'Hide phrase':'Show phrase'}</button><p className="fine-print">Checks an English BIP-39 phrase without an additional passphrase, using the first Ethereum account, m/44'/60'/0'/0/0. A phrase for a different wallet or derivation path may not own your Farcaster account.</p><label className="check-label"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} disabled={busy}/> I understand this phrase controls my wallet.</label><button className="primary full" disabled={busy||!ack}>Find my account</button></form>}
      {path==='create'&&!account&&<><p>Your connected wallet will own the new account. Fund it with <strong>ETH on OP Mainnet (Optimism, chain 10)</strong>. We’ll show the current price and balance before asking you to pay.</p><button className="primary full" disabled={busy} onClick={()=>void connectWallet()}><Wallet size={16}/> Connect wallet to get started</button></>}
      {account&&<div className="account-summary"><span className="fine-print">{path==='create'?'Account owner and funding address':'Detected wallet'}</span><code className="wallet-address">{account.address.slice(0,22)}<wbr/>{account.address.slice(22)}</code><button className="text-button" onClick={async()=>{try{await navigator.clipboard.writeText(account.address);setCopied(true);}catch{setError('Copy the address shown above manually.');}}}>{copied?<Check size={14}/>:<Copy size={14}/>} {copied?'Address copied':'Copy address'}</button>{account.fid&&<p className="detected-fid">FID {account.fid}</p>}</div>}
      {account&&!account.fid&&path!=='create'&&<p className="warning">Our node has no Farcaster account for this wallet. Check that this is the custody wallet. If you registered recently, wait for the node to catch up and try again. For a new account, go Back and choose Create a new account.</p>}
      {path==='create'&&quote&&!account?.fid&&<>
        <dl className="registration-cost"><div><dt>OP Mainnet balance</dt><dd>{formatEther(quote.balance)} ETH</dd></div><div><dt>Registration + initial allowance</dt><dd>{formatEther(quote.price)} ETH</dd></div><div><dt>Estimated OP network fee</dt><dd>{quote.fee===null?'Fund wallet, then refresh':`${formatEther(quote.fee)} ETH`}</dd></div>{quote.fee!==null&&<div><dt>Suggested balance, including fee buffer</dt><dd>{formatEther(quote.price+quote.fee*2n)} ETH</dd></div>}</dl>
        <p className="helper">Send ETH to the address above using <strong>OP Mainnet</strong>, then refresh. ETH on Ethereum mainnet, Base or a testnet will not fund this transaction. Registration is paid once; app-key authorization afterwards is gasless. Your wallet shows the final transaction fee.</p>
        <label>Recovery wallet address (optional)<input value={recovery} placeholder="0x…" autoComplete="off" onChange={e=>{setRecovery(e.target.value);setPaidAck(false);}} disabled={busy}/></label><p className="fine-print">Use a separate wallet you control. Leaving it empty creates the account with no recovery address.</p>
        {recoveryDirty&&<p className="helper">Recovery address changed. Refresh the cost before paying.</p>}<button className="secondary full" onClick={()=>void refresh()} disabled={busy}>Refresh balance and cost</button>
        <label className="check-label"><input type="checkbox" checked={paidAck} onChange={e=>setPaidAck(e.target.checked)} disabled={busy||!ready}/> I approve paying the registration price and network fee on OP Mainnet.{quote.recovery===zeroAddress?' I understand no recovery address is configured.':''}</label>
        <button className="primary full" disabled={busy||(!pending&&(!ready||!paidAck))} onClick={()=>void register()}>{pending?'Check pending registration':'Pay and create account'}</button>
      </>}
      {path==='create'&&account&&!quote&&!account.fid&&<><label>Recovery wallet address (optional)<input value={recovery} onChange={e=>setRecovery(e.target.value)} disabled={busy}/></label><p className="fine-print">Leave empty only if you want no recovery address.</p><button className="secondary full" disabled={busy} onClick={()=>void refresh()}>Refresh balance and cost</button></>}
      {account?.fid&&<><p>{path==='create'?'Your account is registered.':'We found your account.'} Authorize this client to post, react and follow with a new gasless app key.</p><button className="primary full" disabled={busy} onClick={()=>void authorize()}>{busy?'Authorizing…':'Authorize gasless app key'}</button><p className="fine-print">The key expires after 24 hours of inactivity. Reconnect after closing or reloading the client. A newly registered account may take a moment to appear on our node; retry authorization without paying again.</p></>}
    </>}
    {stage&&<p className="helper" role="status">{stage}</p>}
    {hash&&<p className="fine-print"><a href={`https://optimistic.etherscan.io/tx/${hash}`} target="_blank" rel="noreferrer">View registration transaction</a>. A pending transaction is checked again before any retry.</p>}
    {error&&<p role="alert" className="error">{error}</p>}
    {path!=='choose'&&<p className="fine-print">Farcaster messages use our node. New-account price, balance and receipt checks use the public OP Mainnet RPC. App keys are authorized with gasless KEY_ADD; no onchain key registration.</p>}
  </dialog>;
}
