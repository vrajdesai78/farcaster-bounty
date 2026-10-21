import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Home, UserRound, Server, LoaderCircle, X, LogOut, KeyRound } from 'lucide-react';
import { filterCasts, loadFeed, loadProfile, lookupSigner, mapLimited, mergeCasts, NodeError, nodeGet, validFid } from './api';
import type { Cast, NodeInfo, Profile, Session } from './types';
import CastCard from './components/CastCard';
import NodePanel from './components/NodePanel';
import SignerDialog from './components/SignerDialog';

export default function App() {
  const [view,setView]=useState<'feed'|'profile'|'node'>('feed');
  const [mode,setMode]=useState<'following'|'fid'>('following');
  const [fid,setFid]=useState(()=>localStorage.getItem('relay-read-fid')||'3');
  const [nodeUrl,setNodeUrl]=useState('');
  const [hosted,setHosted]=useState(false);
  const [info,setInfo]=useState<NodeInfo|null>(null),[nodeError,setNodeError]=useState(''),[checking,setChecking]=useState(false);
  const [casts,setCasts]=useState<Cast[]>([]),[next,setNext]=useState(''),[note,setNote]=useState(''),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[toast,setToast]=useState('');
  const [profile,setProfile]=useState<Profile|null>(null),[session,setSession]=useState<Session|null>(null),[showSigner,setShowSigner]=useState(false);
  const [draft,setDraft]=useState(''),[reply,setReply]=useState<Cast|undefined>(),[sending,setSending]=useState(false),[followBusy,setFollowBusy]=useState(false),[following,setFollowing]=useState(false);
  const [filter,setFilter]=useState(''),[appliedFilter,setAppliedFilter]=useState<number|null>(null),[filterMode,setFilterMode]=useState<'include'|'exclude'>('include'),[apps,setApps]=useState<Record<string,number|null>>({}),[resolving,setResolving]=useState(false);
  const request=useRef<AbortController|null>(null), filterRequest=useRef(0), textarea=useRef<HTMLTextAreaElement>(null);
  const activeQuery=useRef<{fid:number;mode:'following'|'fid'}|null>(null);
  const nodeBusy=useRef(false);
  async function refreshNode() {
    if(nodeBusy.current)return; nodeBusy.current=true;setChecking(true);
    try{const data=await nodeGet<NodeInfo>('info');setInfo(data);setNodeError('');}
    catch(e){setInfo(null);setNodeError((e as Error).message);}finally{nodeBusy.current=false;setChecking(false);}
  }
  useEffect(()=>{void fetch('/api/config').then(r=>r.json()).then(c=>{setNodeUrl(c.nodeUrl);setHosted(c.mode==='hosted');}).catch(()=>{});void refreshNode();const timer=setInterval(()=>void refreshNode(),30000);return()=>{clearInterval(timer);request.current?.abort();};},[]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),6000);return()=>clearTimeout(t);},[toast]);
  async function resolveApps(items:Cast[]) {
    const id=++filterRequest.current;setResolving(true);
    const signing=await import('./signing');
    const pairs=await mapLimited(items,6,async cast=>{const record=await lookupSigner(cast.data.fid,cast.signer);return [cast.hash,record?signing.appFid(record):null] as const;});
    if(id===filterRequest.current){setApps(Object.fromEntries(pairs));setResolving(false);}
  }
  async function load(more=false, overrideFid?:number, overrideMode?:'following'|'fid') {
    request.current?.abort();const controller=new AbortController();request.current=controller;
    setError('');setBusy(true);
    try {
      const id=overrideFid??validFid(fid), selectedMode=overrideMode??mode;
      if(more&&(activeQuery.current?.fid!==id||activeQuery.current.mode!==selectedMode))throw new Error('Load the new feed before loading more.');
      if(!more){setCasts([]);setApps({});setNext('');setLoaded(false);setProfile(null);setFollowing(false);++filterRequest.current;setResolving(false);}
      const data=await loadFeed(id,selectedMode,more?next:'',controller.signal);
      if(controller.signal.aborted)return;
      const items=more?mergeCasts([...casts,...data.casts]):data.casts;
      setCasts(items);setNext(data.next);setNote(data.note);setLoaded(true);activeQuery.current={fid:id,mode:selectedMode};
      localStorage.setItem('relay-read-fid',String(id));
      if(appliedFilter!==null)void resolveApps(items).catch(e=>{setResolving(false);setError((e as Error).message);});
      if(selectedMode==='fid') {
        const p=await loadProfile(id,controller.signal).catch(()=>null);if(!controller.signal.aborted)setProfile(p);
      }
    }catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{if(!controller.signal.aborted)setBusy(false);}
  }
  useEffect(()=>{
    const controller=new AbortController();setFollowing(false);setFollowBusy(false);
    if(!session||!profile||session.fid===profile.fid)return;
    setFollowBusy(true);
    void nodeGet('linkById',{fid:session.fid,target_fid:profile.fid,link_type:'follow'},controller.signal)
      .then(()=>{if(!controller.signal.aborted)setFollowing(true);})
      .catch(e=>{if(!controller.signal.aborted&&!(e instanceof NodeError&&e.notFound))setError(`Could not check follow status: ${e.message}`);})
      .finally(()=>{if(!controller.signal.aborted)setFollowBusy(false);});
    return()=>controller.abort();
  },[session?.fid,session?.publicKey,profile?.fid]);
  function openProfile(id:number){setView('profile');setMode('fid');setFid(String(id));void load(false,id,'fid');}
  async function write(action:()=>Promise<unknown>){setError('');try{await action();setToast('Confirmed on your node.');return true;}catch(e){setError((e as Error).message);return false;}}
  async function sendCast(){if(!session){setShowSigner(true);return;}setSending(true);try{const s=await import('./signing');if(await write(()=>s.submit(s.castMessage(session,draft,reply)))){setDraft('');setReply(undefined);}}finally{setSending(false);}}
  async function react(cast:Cast,kind:'like'|'recast',remove:boolean){if(!session){setShowSigner(true);return false;}const s=await import('./signing');return write(()=>s.submit(s.reactionMessage(session,cast,kind,remove)));}
  async function toggleFollow(){if(!session){setShowSigner(true);return;}if(!profile)return;setFollowBusy(true);try{const s=await import('./signing');if(await write(()=>s.submit(s.followMessage(session,profile.fid,following))))setFollowing(!following);}finally{setFollowBusy(false);}}
  function forget(){session?.privateKey.fill(0);setSession(null);setToast('Signer forgotten on this device. Its network authorization remains until revoked or expired.');}
  async function revoke(){if(!session)return;setSending(true);try{const s=await import('./signing');if(await write(()=>s.revokeSigner(session))){session.privateKey.fill(0);setSession(null);setToast('Signer revoked on the network and forgotten on this device.');}}finally{setSending(false);}}
  const byteCount=new TextEncoder().encode(draft).length;
  const filtered=filterCasts(casts,apps,appliedFilter,filterMode);
  function changeSource(selectedMode: 'following'|'fid') {
    request.current?.abort(); ++filterRequest.current;setResolving(false);setBusy(false);setMode(selectedMode);setLoaded(false);setCasts([]);setApps({});setNext('');setNote('');setProfile(null);setFollowing(false);activeQuery.current=null;
  }
  const unknownApps=casts.filter(c=>apps[c.hash]==null).length;
  return <div className="app-shell">
    <aside className="sidebar"><a href="#" className="brand" onClick={e=>{e.preventDefault();setView('feed');}}><span className="brand-mark" aria-hidden="true"><i/><i/></span>Relay</a><nav aria-label="Main navigation">{[{id:'feed',label:'Feed',Icon:Home},{id:'profile',label:'Profile',Icon:UserRound},{id:'node',label:'Your node',Icon:Server}].map(({id,label,Icon})=><button key={id} className={view===id?'nav-item selected':'nav-item'} onClick={()=>{setView(id as typeof view);if(id==='profile'){const candidate=Number(fid);openProfile(session?.fid??(Number.isSafeInteger(candidate)&&candidate>0?candidate:3));}}}><Icon size={22}/>{label}</button>)}</nav><div className="sidebar-bottom">{session&&<div className="session-info"><KeyRound size={15}/><span>Writing as FID {session.fid}</span><button className="icon-button" onClick={forget} title="Forget signer" aria-label="Forget signer"><LogOut size={15}/></button><button className="text-button" disabled={sending} onClick={()=>void revoke()}>Revoke authorization</button></div>}<span className="local-state"><span className="status-dot"/>{hosted?'Hosted':'Local'} · Mainnet</span></div></aside>
    <main className="main"><header className="page-header"><h1>{view==='feed'?'Your Farcaster feed':view==='profile'?'Profile': 'Your node'}</h1><p>{view==='feed'?'Read and post through your own node.':view==='profile'?'Account details and casts from your node.':'Check the connection and shard delays.'}</p></header>
    {view==='node'?<NodePanel hosted={hosted} info={info} error={nodeError} url={nodeUrl} loading={checking} refresh={()=>void refreshNode()} full/>:<>
      {view==='feed'&&<div className="tabs" role="tablist" aria-label="Feed source"><button role="tab" aria-selected={mode==='following'} className={mode==='following'?'selected':''} onClick={()=>{changeSource('following');}}>Following</button><button role="tab" aria-selected={mode==='fid'} className={mode==='fid'?'selected':''} onClick={()=>{changeSource('fid');}}>By FID</button></div>}
      <form className="feed-controls" onSubmit={e=>{e.preventDefault();void load();}}><label htmlFor="read-fid">{view==='profile'?'Profile FID':'Read as FID'}</label><input id="read-fid" inputMode="numeric" type="number" min="1" required value={fid} onChange={e=>setFid(e.target.value)}/><button className="primary" disabled={busy}>{busy?<LoaderCircle className="spin" size={16}/>:null}{view==='profile'?'Load profile':'Load feed'}</button></form>
      {profile&&<section className="profile-detail"><div><h2>{profile.name}</h2><p className="helper">{profile.username?`@${profile.username} · `:''}FID {profile.fid}</p><p>{profile.bio}</p></div>{profile.fid!==session?.fid&&<button className="secondary" disabled={followBusy} onClick={()=>void toggleFollow()}>{following?'Unfollow':'Follow'}</button>}</section>}
      <section className="composer" aria-label="Compose a cast">{reply&&<div className="reply-banner">Replying to FID {reply.data.fid}<button className="icon-button" aria-label="Cancel reply" onClick={()=>setReply(undefined)}><X size={14}/></button></div>}<label className="sr-only" htmlFor="cast-text">What’s on your mind?</label><textarea ref={textarea} id="cast-text" placeholder="What’s on your mind?" value={draft} onChange={e=>setDraft(e.target.value)} rows={4}/><div className="composer-footer"><span className={byteCount>320?'error':'fine-print'}>{draft?`${byteCount} / 320 bytes`:session?`Writing as FID ${session.fid}`:''}</span><button className="primary" disabled={sending||byteCount>320||!!session&&!draft.trim()} onClick={()=>void sendCast()}>{sending?'Confirming…':session?'Publish cast':'Connect signer'}</button></div></section>
      {(loaded||filter)&&<form className="filter-controls" onSubmit={e=>{e.preventDefault();if(filter){try{setAppliedFilter(validFid(filter));void resolveApps(casts).catch(e=>{setError((e as Error).message);setResolving(false);});}catch(e){setError((e as Error).message);}}}}><label htmlFor="app-filter">Filter by client</label><select aria-label="Client filter mode" value={filterMode} onChange={e=>setFilterMode(e.target.value as typeof filterMode)}><option value="include">Include only</option><option value="exclude">Exclude</option></select><input id="app-filter" type="number" min="1" placeholder="App FID" value={filter} onChange={e=>setFilter(e.target.value)}/><button className="secondary" disabled={resolving}>{resolving?'Resolving…':'Apply'}</button>{filter&&<button className="text-button" type="button" onClick={()=>{setFilter('');setAppliedFilter(null);++filterRequest.current;setResolving(false);}}>Clear</button>}</form>}
      {appliedFilter!==null&&!resolving&&unknownApps>0&&<p className="feed-note">{unknownApps} loaded posts have unknown app attribution and are omitted from filtered results.</p>}
      {error&&<p role="alert" className="notice error">{error}</p>}
      {!info&&!loaded&&<div className="sync-strip"><LoaderCircle size={30} className={checking?'spin':''}/><div><strong>Waiting for your node</strong><p>Reads will appear when your node is ready.</p></div></div>}
      {busy&&<div role="status" className="loading-line"><LoaderCircle size={18} className="spin"/> Reading from your node…</div>}
      {!busy&&!casts.length&&<div className="empty-state"><div className="orbit" aria-hidden="true"><i/><b/></div><h2>{loaded?'No casts found':info?'Choose an account to read':'Cannot reach your node'}</h2><p>{loaded?'No casts in this feed yet. Try another FID or follow a few accounts.':info?'Enter an FID above and load its following feed or casts.':'Your node is unavailable. Check your connection or server logs, then try again.'}</p><button className="secondary" onClick={()=>setView('node')}>Check node</button></div>}
      {note&&<p className="feed-note">{note}</p>}
      {!busy&&casts.length>0&&!filtered.length&&<p className="notice">{resolving?'Looking up signer registrations…':'No matching casts in the loaded posts. Attribution may be unavailable for removed or expired signers. Load more posts or clear the filter.'}</p>}
      <section aria-label="Casts">{filtered.map(cast=><CastCard key={cast.hash} cast={cast} session={session} onProfile={openProfile} onReply={c=>{setReply(c);textarea.current?.focus();textarea.current?.scrollIntoView({behavior:'smooth',block:'center'});}} action={react} onApp={app=>{setFilter(String(app));setAppliedFilter(app);setFilterMode('include');void resolveApps(casts).catch(e=>{setResolving(false);setError((e as Error).message);});}} attribution={apps[cast.hash]}/>)}</section>
      {loaded&&next&&<button className="secondary load-more" disabled={busy} onClick={()=>void load(true)}>Load more</button>}
      {loaded&&<p className="fine-print attribution-note">Client filtering uses the signer’s verified app FID, not text tags. Self-authorized keys are attributed to their own FID. Reactions shown as active reflect confirmed actions made in this session.</p>}
    </>}
    </main>{session&&<div className="mobile-account"><span>Writing as FID {session.fid}</span><button className="text-button" disabled={sending} onClick={()=>void revoke()}>Revoke</button><button className="text-button" onClick={forget}>Forget</button></div>}<aside className="right-sidebar"><NodePanel hosted={hosted} info={info} error={nodeError} url={nodeUrl} loading={checking} refresh={()=>void refreshNode()}/><a className="docs-link" href="https://snapchain.farcaster.xyz" target="_blank" rel="noreferrer">Snapchain documentation <ArrowUpRight size={14}/></a></aside>
    {toast&&<div className="toast" role="status">{toast}<button className="icon-button" aria-label="Dismiss notification" onClick={()=>setToast('')}><X size={15}/></button></div>}
    {showSigner&&<SignerDialog initialFid={fid} close={()=>setShowSigner(false)} connected={s=>{session?.privateKey.fill(0);setSession(s);setShowSigner(false);setToast('Signer connected for this session.');}}/>}
  </div>;
}
