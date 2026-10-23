import {useEffect, useState} from 'react';
import {ArrowLeft, LoaderCircle} from 'lucide-react';
import {loadCast, loadReplies, mergeCasts} from '../api';
import type {Cast, Session} from '../types';
import CastCard from './CastCard';

type Props = {target:{fid:number;hash:string}; session:Session|null; revision:number; onProfile:(fid:number)=>void; onReply:(cast:Cast)=>void; action:(cast:Cast,kind:'like'|'recast',remove:boolean)=>Promise<boolean>};
export default function Conversation({target,session,revision,onProfile,onReply,action}:Props){
  const [root,setRoot]=useState<Cast|null>(null),[replies,setReplies]=useState<Cast[]>([]),[next,setNext]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setRoot(null);setReplies([]);setNext('');setError('');setBusy(true);
    void Promise.all([loadCast(target.fid,target.hash,controller.signal),loadReplies(target.fid,target.hash,'',controller.signal)]).then(([cast,page])=>{if(!controller.signal.aborted){setRoot(cast);setReplies(page.casts);setNext(page.next);}}).catch(e=>{if(!controller.signal.aborted)setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setBusy(false)});
    return()=>controller.abort();
  },[target.fid,target.hash,revision,retry]);
  async function more(){setBusy(true);setError('');try{const page=await loadReplies(target.fid,target.hash,next);setReplies(items=>mergeCasts([...items,...page.casts]).reverse());setNext(page.next);}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  const card=(cast:Cast)=><CastCard key={cast.hash} cast={cast} session={session} onProfile={onProfile} onReply={onReply} action={action} onApp={()=>{}} attribution={undefined}/>;
  return <section className="conversation" aria-label="Conversation">
    <a className="back-link" href="#/feed"><ArrowLeft size={18}/> Back to feed</a>
    {error&&<div className="notice" role="alert">{error} <button className="text-button" onClick={()=>setRetry(n=>n+1)}>Try again</button></div>}
    {root&&<>{root.data.castAddBody.parentCastId&&<a className="back-link" href={`#/cast/${root.data.castAddBody.parentCastId.fid}/${root.data.castAddBody.parentCastId.hash}`}>View parent cast</a>}{card(root)}<button className="primary" onClick={()=>onReply(root)}>Reply to this cast</button><h2 className="replies-heading">Replies</h2>{replies.map(card)}{!busy&&!replies.length&&!error&&<p className="helper">No replies yet. Start the conversation.</p>}</>}
    {busy&&<p role="status" className="loading-line"><LoaderCircle size={18} className="spin"/> Reading conversation…</p>}
    {next&&<button className="secondary load-more" disabled={busy} onClick={()=>void more()}>More replies</button>}
  </section>;
}
