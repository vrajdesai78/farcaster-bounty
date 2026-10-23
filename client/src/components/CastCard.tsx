import { useEffect, useState } from 'react';
import { Heart, Repeat2, MessageCircle, ExternalLink } from 'lucide-react';
import { loadProfile, safeUrl } from '../api';
import type { Cast, Profile, Session } from '../types';

const profiles=new Map<number,Promise<Profile>>();
export default function CastCard({cast,session,onProfile,onReply,action,onApp,attribution}: {cast:Cast;session:Session|null;onProfile:(fid:number)=>void;onReply:(cast:Cast)=>void;action:(cast:Cast,kind:'like'|'recast',remove:boolean)=>Promise<boolean>;onApp:(app:number)=>void;attribution:number|null|undefined}) {
  const [imageFailed,setImageFailed]=useState(false);
  const [profile,setProfile]=useState<Profile|null>(null),[pending,setPending]=useState(false),[liked,setLiked]=useState(false),[recast,setRecast]=useState(false);
  useEffect(()=>{let active=true; if(!profiles.has(cast.data.fid))profiles.set(cast.data.fid,loadProfile(cast.data.fid).catch(e=>{profiles.delete(cast.data.fid);throw e;})); profiles.get(cast.data.fid)!.then(p=>{if(active)setProfile(p);}).catch(()=>{});return()=>{active=false;};},[cast.data.fid]);
  useEffect(()=>{setLiked(false);setRecast(false);},[session?.publicKey]);
  useEffect(()=>setImageFailed(false),[profile?.pfp]);
  const date=new Date((cast.data.timestamp+1609459200)*1000);
  async function react(kind:'like'|'recast') {setPending(true);try {const remove=kind==='like'?liked:recast;const accepted=await action(cast,kind,remove);if(accepted&&session){if(kind==='like')setLiked(!remove);else setRecast(!remove);}} finally{setPending(false);}}
  return <article className="cast">
    <button className="avatar" onClick={()=>onProfile(cast.data.fid)} aria-label={`View FID ${cast.data.fid}`}>{profile?.pfp&&!imageFailed&&safeUrl(profile.pfp)?<img loading="lazy" src={profile.pfp} alt="" referrerPolicy="no-referrer" onError={()=>setImageFailed(true)}/>:String(profile?.name||cast.data.fid).slice(0,2)}</button>
    <div className="cast-content"><div className="cast-meta"><button className="text-button name" onClick={()=>onProfile(cast.data.fid)}>{profile?.name||`FID ${cast.data.fid}`}</button><span>{profile?.username?`@${profile.username}`:''}</span><time dateTime={date.toISOString()} title={date.toLocaleString()}>{date.toLocaleDateString(undefined,{month:'short',day:'numeric'})}</time></div>
    {cast.data.castAddBody.parentCastId&&<span className="reply-context">Reply to FID {cast.data.castAddBody.parentCastId.fid}</span>}
    <a className="conversation-link" href={`#/cast/${cast.data.fid}/${cast.hash}`} aria-label={`Open conversation by ${profile?.name||`FID ${cast.data.fid}`}`}><p className="cast-text">{cast.data.castAddBody.text||"View cast"}</p></a>
    {[...new Set(cast.data.castAddBody.embeds?.filter(e=>e.url&&safeUrl(e.url)).map(e=>e.url!) || [])].map(url=><a className="embed-link" key={url} href={safeUrl(url)} target="_blank" rel="noreferrer">{url}<ExternalLink size={13}/></a>)}
    <div className="cast-actions"><button disabled={pending} onClick={()=>onReply(cast)}><MessageCircle size={16}/> Reply</button><button disabled={pending} className={liked?'active-reaction':''} onClick={()=>void react('like')}><Heart size={16} fill={liked?'currentColor':'none'}/>{liked?'Remove like':'Like'}</button><button disabled={pending} className={recast?'active-reaction':''} onClick={()=>void react('recast')}><Repeat2 size={16}/>{recast?'Undo recast':'Recast'}</button>{attribution?<button className="app-attribution" onClick={()=>onApp(attribution)}>App FID {attribution}</button>:<span className="app-attribution">{attribution===undefined?'':'App unknown'}</span>}</div></div>
  </article>;
}
