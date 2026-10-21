import { useEffect, useRef, useState } from 'react';
import { X, KeyRound, Wallet } from 'lucide-react';
import { validFid } from '../api';
import type { Session } from '../types';

export default function SignerDialog({ initialFid, close, connected }: { initialFid: string; close: () => void; connected: (session: Session) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [method, setMethod] = useState<'wallet'|'import'|'recovery'>('wallet');
  const [fid,setFid]=useState(initialFid), [secret,setSecret]=useState(''), [busy,setBusy]=useState(false), [error,setError]=useState('');
  useEffect(()=>{ const el=dialog.current!; el.showModal(); return ()=>el.close(); },[]);
  async function connect(e: React.FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const signing=await import('../signing');
      const id=validFid(fid);
      const session=method==='import' ? await signing.importSigner(id,secret) : await signing.registerSigner(id,method==='recovery'?secret:undefined);
      setSecret(''); connected(session);
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not connect signer.'); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} onCancel={e=>{if(busy)e.preventDefault();else close();}} className="signer-dialog" aria-labelledby="signer-title">
    <div className="dialog-header"><span className="dialog-icon"><KeyRound size={22}/></span><button className="icon-button" aria-label="Close signer dialog" onClick={close} disabled={busy}><X size={20}/></button></div>
    <h2 id="signer-title">Connect an app signer</h2><p>Authorize an app signer for an existing test account. Your keys stay in memory on this device and are forgotten when you close or reload the client.</p>
    <div className="segmented" aria-label="Authorization method">{(['wallet','import','recovery'] as const).map(m=><button key={m} disabled={busy} className={method===m?'selected':''} onClick={()=>{setMethod(m);setSecret('');setError('');}}>{m==='wallet'?'Browser wallet':m==='import'?'Existing signer':'Test recovery'}</button>)}</div>
    <form onSubmit={connect}>
      <label>Account FID<input type="number" min="1" step="1" required value={fid} onChange={e=>setFid(e.target.value)} disabled={busy}/></label>
      {method==='wallet'&&<p className="helper">Connect the custody wallet for this FID. You will approve two typed signatures to register a scoped app key, valid for 24 hours of inactivity. No transaction or gas payment.</p>}
      {method!=='wallet'&&<label>{method==='import'?'Registered Ed25519 app private key':'Test-account recovery phrase'}<textarea required autoComplete="off" spellCheck={false} rows={3} value={secret} onChange={e=>setSecret(e.target.value)} disabled={busy} placeholder={method==='import'?'0x… (32 bytes)':'Test accounts only · never your main wallet'}/></label>}
      {method==='recovery'&&<p className="warning">Use a disposable test account with an existing FID and storage. Enter a phrase only into software from developers you trust. Anyone with it can control that wallet and its funds. Prefer a browser wallet to authorize a separate app key. This option derives the first Ethereum account locally; The client does not send the phrase to its server.</p>}
      {method==='import'&&<p className="helper">This must already be registered to the FID. A wallet private key is a different kind of key. Imported signers retain their existing scopes.</p>}
      {error&&<p role="alert" className="error">{error}</p>}
      <button className="primary full" disabled={busy}>{busy?'Authorizing and confirming…':method==='import'?'Connect signer':<><Wallet size={16}/> Authorize test signer</>}</button>
    </form>
    <p className="fine-print">This client uses your own FID as the requesting app for self-authorization. It does not claim a shared app identity. Authorization writes to mainnet when you confirm.</p>
  </dialog>;
}
