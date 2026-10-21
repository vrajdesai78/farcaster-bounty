// Optional authoring tool. The published guide uses the generated SVGs only.
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const requireClient=createRequire(resolve(root,'client/package.json'));
const {chromium}=requireClient('@playwright/test');
const bundle=fileURLToPath(new URL('./mermaid.min.js',import.meta.resolve('mermaid')));
const font=(await readFile(resolve(root,'site/assets/instrument-sans.woff2'))).toString('base64');
const fontRule=`@font-face{font-family:Instrument;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:400 700;font-style:normal}`;
const browser=await chromium.launch(process.env.DIAGRAM_BROWSER_CHANNEL?{channel:process.env.DIAGRAM_BROWSER_CHANNEL,headless:true}:{headless:true});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1200},reducedMotion:'reduce'});
 await page.setContent(`<style>${fontRule}</style><div id="graph"></div>`);
 await page.addScriptTag({path:bundle});
 await page.evaluate(async()=>{
  await document.fonts.load('16px Instrument');
  window.mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'base',fontFamily:'Instrument, sans-serif',fontSize:17,
   sequence:{useMaxWidth:false,actorFontFamily:'Instrument',actorFontSize:17,messageFontFamily:'Instrument',messageFontSize:17,noteFontFamily:'Instrument',noteFontSize:16,width:130,actorMargin:45,mirrorActors:false},
   deterministicIds:true,deterministicIDSeed:'farcaster-guide',htmlLabels:false,
   flowchart:{htmlLabels:false,useMaxWidth:false,curve:'basis',nodeSpacing:34,rankSpacing:64,padding:18},
   themeCSS:'.node rect, .node polygon, .node path, .cluster rect {filter:none!important} ',
   themeVariables:{primaryColor:'#f1edff',primaryBorderColor:'#795acb',primaryTextColor:'#24183e',lineColor:'#756c86',textColor:'#262330',clusterBkg:'#f5faf8',clusterBorder:'#aac7be',edgeLabelBackground:'#ffffff',fontSize:'17px'}});
 });
 await mkdir(resolve(root,'site/assets/diagrams'),{recursive:true});
 for(const name of (await readdir(resolve(root,'site/diagrams'))).filter(n=>n.endsWith('.mmd')).sort()){
  const source=await readFile(resolve(root,'site/diagrams',name),'utf8');
  const id='diagram-'+name.replace('.mmd','');
  let svg=await page.evaluate(async({source,id})=>(await window.mermaid.render(id,source)).svg,{source,id});
  svg=svg.replace(/(<svg[^>]*>)/,`$1<style>${fontRule}</style>`);
  if(/<script|<foreignObject|(?:href|src)="https?:/i.test(svg))throw new Error('Unexpected active or remote SVG content: '+name);
  const output=name.replace('.mmd','.svg');
  await writeFile(resolve(root,'site/assets/diagrams',output),svg+'\n');
  console.log(output);
 }
}finally{await browser.close();}
