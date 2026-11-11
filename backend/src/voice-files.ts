import { readdir } from 'node:fs/promises';
import path from 'node:path';

type VoiceFile={voice:string;file:string;path:string};
type VoiceIndex=Map<string,VoiceFile[]>;
const cache=new Map<string,{until:number;promise:Promise<VoiceIndex>}>();
export function responseVoiceKey(info:string,response:number){return `00${info.slice(2).toLowerCase()}_${response}`;}
export async function scanVoiceFiles(root:string):Promise<VoiceIndex>{
 const index:VoiceIndex=new Map();let dirs;try{dirs=await readdir(root,{withFileTypes:true})}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return index;throw e}
 await Promise.all(dirs.filter(d=>d.isDirectory()).map(async dir=>{const files=await readdir(path.join(root,dir.name),{withFileTypes:true});for(const file of files){if(!file.isFile())continue;const match=file.name.match(/_(00[0-9a-f]{6})_(\d+)\.wav$/i);if(!match)continue;const key=`${match[1].toLowerCase()}_${Number(match[2])}`,item={voice:dir.name,file:file.name,path:path.join(root,dir.name,file.name)},list=index.get(key)??[];list.push(item);index.set(key,list)}}));
 for(const entries of index.values())entries.sort((a,b)=>a.voice.localeCompare(b.voice)||a.file.localeCompare(b.file));return index;
}
export function voiceIndex(dataDir:string,plugin:string){const root=path.join(dataDir,'Sound','Voice',plugin),now=Date.now(),old=cache.get(root);if(old&&old.until>now)return old.promise;const promise=scanVoiceFiles(root);cache.set(root,{until:now+10000,promise});promise.catch(()=>{if(cache.get(root)?.promise===promise)cache.delete(root)});return promise;}
export function voicesFor(index:VoiceIndex,info:string,response:number,ownIndex:number){if(!/^[0-9a-f]{8}$/i.test(info)||parseInt(info.slice(0,2),16)!==ownIndex)return [];return index.get(responseVoiceKey(info,response))??[];}

export function clearVoiceIndex(dataDir:string,plugin:string){cache.delete(path.join(dataDir,'Sound','Voice',plugin))}
