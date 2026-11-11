import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { findObjectiveLinks, questFragments } from './quest-objectives.js';
import { inflateSync } from 'node:zlib';
import type { PluginQuest, PluginSnapshot } from '../../shared/types.js';
type RecordEntry = { type: string; id: number; flags: number; data: Buffer };
function* fields(data: Buffer): Generator<[string, Buffer]> {
 let p=0, extended: number | undefined;
 while(p<data.length) { if(p+6>data.length) throw new Error('Incomplete subrecord.'); const type=data.toString('ascii',p,p+4), size=data.readUInt16LE(p+4); p+=6; if(type==='XXXX' && size===4) { if(p+4>data.length) throw new Error('Invalid subrecord.'); extended=data.readUInt32LE(p); p+=4; continue; } const end=p+(extended ?? size); if(end>data.length) throw new Error('Invalid subrecord.'); yield [type,data.subarray(p,end)]; p=end; extended=undefined; }
}
function* records(b: Buffer,start=0,end=b.length): Generator<RecordEntry> {
 for(let p=start;p<end;) { if(p+24>end) throw new Error('Incomplete record header.'); const type=b.toString('ascii',p,p+4), size=b.readUInt32LE(p+4), next=p+size+(type==='GRUP'?0:24); if(next<=p+23 || next>end) throw new Error('Invalid record size.'); if(type==='GRUP') yield* records(b,p+24,next); else if((type==='TES4'||type==='QUST'||type==='NPC_'||type==='VTYP') && !(b.readUInt32LE(p+8)&0x20)) { const flags=b.readUInt32LE(p+8), raw=b.subarray(p+24,next); yield {type,id:b.readUInt32LE(p+12),flags,data:flags&0x40000?inflateSync(raw.subarray(4)):raw}; } p=next; }
}
function text(b: Buffer) { const zero=b.indexOf(0); const x=zero<0?b:b.subarray(0,zero); const s=x.toString('utf8'); return s.includes('�')?new TextDecoder('windows-1252').decode(x):s; }
export async function readPlugin(file: string, dataDirectory=path.dirname(file)): Promise<PluginSnapshot> {
 if(!/\.(esp|esm)$/i.test(file)) throw new Error('Select an ESP or ESM file.');
 const b=await readFile(file); const all=[...records(b)]; const header=all.find(r=>r.type==='TES4'); if(!header) throw new Error('TES4 header not found.');
 const masters=[...fields(header.data)].filter(([t])=>t==='MAST').map(([,x])=>text(x)); const own=masters.length;
 const quests: PluginQuest[]=await Promise.all(all.filter(r=>r.type==='QUST' && (r.id>>>24)===own).map(async r=>{const f=[...fields(r.data)], edid=f.find(([t])=>t==='EDID')?.[1], full=f.find(([t])=>t==='FULL')?.[1], name=!(header.flags&0x80)&&full?text(full).trim():''; let stageObjectives:Record<string,number[]>|undefined;try{const vmad=f.find(([t])=>t==='VMAD')?.[1];if(vmad)stageObjectives=await findObjectiveLinks(dataDirectory,questFragments(vmad))}catch{} const objectiveTexts:Record<string,string>={};let objective:number|undefined;for(const [kind,value] of f){if(kind==='QOBJ')objective=value.length>=2?value.readUInt16LE():undefined;else if(kind==='NNAM'&&objective!==undefined&&!(header.flags&0x80)){const name=text(value).trim();if(name)objectiveTexts[objective]=name;objective=undefined}} return {id:edid?text(edid):'',...(name?{name}:{}),...(stageObjectives?{stageObjectives,objectiveStages:Object.keys(stageObjectives).map(Number)}:{}),...(Object.keys(objectiveTexts).length?{objectiveTexts}:{}),formId:r.id.toString(16).padStart(8,'0').toUpperCase(),stages:[...new Set(f.filter(([t,x])=>t==='INDX'&&x.length>=2).map(([,x])=>x.readUInt16LE(0)))].sort((a,b)=>a-b)};}));
 const namedQuests=quests.filter(q=>q.id);
 return {plugin:path.basename(file),masters,quests:namedQuests,importedAt:new Date().toISOString()};
}

export function parsePluginNpcs(b:Buffer) {
 const all=[...records(b)], header=all.find(r=>r.type==='TES4'); if(!header) throw new Error('TES4 header not found.');
 const own=[...fields(header.data)].filter(([t])=>t==='MAST').length;
 return all.filter(r=>r.type==='NPC_' && (r.id>>>24)===own).map(r=>{const f=[...fields(r.data)],edid=f.find(([t])=>t==='EDID')?.[1],full=f.find(([t])=>t==='FULL')?.[1]; return {formId:r.id.toString(16).padStart(8,'0').toUpperCase(),editorId:edid?text(edid):'',name:full&&!(header.flags&0x80)?text(full):''};}).sort((a,b)=>(a.name||a.editorId).localeCompare(b.name||b.editorId));
}
export async function readPluginNpcs(file:string) { return parsePluginNpcs(await readFile(file)); }

// Voice folders are named after VTYP editor IDs; several NPCs may share one.
export function parseVoiceSpeakers(b:Buffer):Map<string,string[]> {
 const all=[...records(b)],header=all.find(r=>r.type==='TES4');if(!header)throw new Error('TES4 header not found.');
 const types=new Map<number,string>();for(const r of all){if(r.type!=='VTYP')continue;const id=[...fields(r.data)].find(([name])=>name==='EDID')?.[1];if(id){const value=text(id).trim();if(value)types.set(r.id,value.toLowerCase())}}
 const result=new Map<string,Set<string>>();for(const r of all){if(r.type!=='NPC_')continue;const f=[...fields(r.data)],voice=f.find(([name])=>name==='VTCK')?.[1],full=f.find(([name])=>name==='FULL')?.[1];if(!voice||voice.length!==4||!full||(header.flags&0x80))continue;const type=types.get(voice.readUInt32LE()),name=text(full).trim();if(!type||!name)continue;const names=result.get(type)??new Set<string>();names.add(name);result.set(type,names)}
 return new Map([...result].map(([key,names])=>[key,[...names].sort((a,b)=>a.localeCompare(b))]));
}
const voiceSpeakersCache=new Map<string,{stamp:string;value:Promise<Map<string,string[]>>}>();
export async function readVoiceSpeakers(file:string){const {stat}=await import('node:fs/promises');const info=await stat(file),stamp=`${info.size}:${info.mtimeMs}`;const old=voiceSpeakersCache.get(file);if(old?.stamp===stamp)return old.value;const value=readFile(file).then(parseVoiceSpeakers);voiceSpeakersCache.set(file,{stamp,value});try{return await value}catch(error){if(voiceSpeakersCache.get(file)?.value===value)voiceSpeakersCache.delete(file);throw error}}

export function parseSpeakerOptions(b:Buffer){const all=[...records(b)],header=all.find(r=>r.type==='TES4');if(!header)throw new Error('TES4 header not found.');const own=[...fields(header.data)].filter(([type])=>type==='MAST').length;const types=new Map<number,string>();for(const r of all){if(r.type!=='VTYP')continue;const edid=[...fields(r.data)].find(([type])=>type==='EDID')?.[1];if(edid)types.set(r.id,text(edid));}return all.filter(r=>r.type==='NPC_'&&(r.id>>>24)===own).map(r=>{const f=[...fields(r.data)],edid=f.find(([t])=>t==='EDID')?.[1],full=f.find(([t])=>t==='FULL')?.[1],voice=f.find(([t])=>t==='VTCK')?.[1];return {formId:r.id.toString(16).padStart(8,'0').toUpperCase(),editorId:edid?text(edid):'',name:full&&!(header.flags&0x80)?text(full):'',voiceType:voice?.length===4?types.get(voice.readUInt32LE())??'':''}}).filter(n=>n.editorId).sort((a,b)=>(a.name||a.editorId).localeCompare(b.name||b.editorId)||a.editorId.localeCompare(b.editorId));}
export async function readSpeakerOptions(file:string){return parseSpeakerOptions(await readFile(file))}
