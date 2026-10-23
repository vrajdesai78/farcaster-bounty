import { useEffect, useRef, useState } from 'react';
import { X, KeyRound, Wallet } from 'lucide-react';
import { validFid } from '../api';
import type { Session } from '../types';

export default function SignerDialog({ initialFid, close, connected }: { initialFid: string; close: () => void; connected: (session: Session) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [fid,setFid]=useState(initialFid), [busy,setBusy]=useState(false), [error,setError]=useState('');
  useEffect(()=>{ const el=dialog.current!; el.showModal(); return ()=>el.close(); },[]);
  async function connect(e: React.FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const signing=await import('../signing');
      const id=validFid(fid);
      const session=await signing.registerSigner(id);
      connected(session);
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not connect signer.'); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} onCancel={e=>{if(busy)e.preventDefault();else close();}} className="signer-dialog" aria-labelledby="signer-title">
    <div className="dialog-header"><span className="dialog-icon"><KeyRound size={22}/></span><button className="icon-button" aria-label="Close signer dialog" onClick={close} disabled={busy}><X size={20}/></button></div>
    <h2 id="signer-title">Authorize a gasless app key</h2><p>Authorize an app signer for an existing test account. Your keys stay in memory on this device and are forgotten when you close or reload the client.</p>
    <form onSubmit={connect}>
      <label>Account FID<input type="number" min="1" step="1" required value={fid} onChange={e=>setFid(e.target.value)} disabled={busy}/></label>
      <p className="helper">Connect the custody wallet for this FID. You will approve two typed signatures to register a scoped app key, valid for 24 hours of inactivity. No transaction or gas payment.</p>
      {error&&<p role="alert" className="error">{error}</p>}
      <button className="primary full" disabled={busy}>{busy?'Authorizing and confirming…':<><Wallet size={16}/> Authorize gasless key</>}</button>
    </form>
    <p className="fine-print">This client uses your own FID as the requesting app for self-authorization. It does not claim a shared app identity. Authorization writes to mainnet when you confirm.</p>
  </dialog>;
}
