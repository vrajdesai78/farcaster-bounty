import {useEffect,useState} from 'react';
import {Download, X} from 'lucide-react';
interface InstallEvent extends Event {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>}
export default function InstallApp({publicAccess=false}:{publicAccess?:boolean}){
 const [prompt,setPrompt]=useState<InstallEvent|null>(null),[help,setHelp]=useState(false),[installed,setInstalled]=useState(()=>matchMedia('(display-mode: standalone)').matches);
 useEffect(()=>{const capture=(e:Event)=>{e.preventDefault();setPrompt(e as InstallEvent)};const done=()=>{setInstalled(true);setPrompt(null)};window.addEventListener('beforeinstallprompt',capture);window.addEventListener('appinstalled',done);return()=>{window.removeEventListener('beforeinstallprompt',capture);window.removeEventListener('appinstalled',done)}},[]);
 if(installed)return null;
 async function install(){if(!prompt){setHelp(true);return;}await prompt.prompt();await prompt.userChoice;setPrompt(null)}
 return <section className="install-app"><button className="secondary" onClick={()=>void install()}><Download size={16}/> Install app</button>{help&&<div className="install-help"><button className="icon-button" aria-label="Close installation help" onClick={()=>setHelp(false)}><X size={16}/></button><p>On iPhone or iPad, open this address in Safari, tap Share, then Add to Home Screen. On Android, use your browser’s Install app or Add to Home screen menu.</p><p>Open the HTTPS client address on your phone. {publicAccess?'This client opens without a website login.':'Your client login is still required.'} Signing keys stay in memory, so reconnect your account after closing or reloading the app.</p></div>}</section>
}
