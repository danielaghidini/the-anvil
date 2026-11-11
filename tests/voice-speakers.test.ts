import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVoiceSpeakers, parseSpeakerOptions} from '../backend/src/plugin.js';
const sub=(type:string,data:Buffer)=>{const h=Buffer.alloc(6);h.write(type);h.writeUInt16LE(data.length,4);return Buffer.concat([h,data])};
const rec=(type:string,id:number,data:Buffer)=>{const h=Buffer.alloc(24);h.write(type);h.writeUInt32LE(data.length,4);h.writeUInt32LE(id,12);return Buffer.concat([h,data])};
const id=(n:number)=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b};
const npc=(idNum:number,name:string,voice:number)=>rec('NPC_',idNum,Buffer.concat([sub('EDID',Buffer.from(name+'NPC\0')),sub('FULL',Buffer.from(name+'\0')),sub('VTCK',id(voice))]));
test('voice types resolve NPC names and retain shared voices without guessing',()=>{const plugin=Buffer.concat([rec('TES4',0,Buffer.alloc(0)),rec('VTYP',0x800,sub('EDID',Buffer.from('HeroVoice\0'))),rec('VTYP',0x801,sub('EDID',Buffer.from('SharedVoice\0'))),npc(0x810,'Bjorn',0x800),npc(0x811,'Anika',0x801),npc(0x812,'Bella',0x801),npc(0x813,'Unknown voice',0x999)]);const names=parseVoiceSpeakers(plugin);assert.deepEqual(names.get('herovoice'),['Bjorn']);assert.deepEqual(names.get('sharedvoice'),['Anika','Bella']);assert.equal(names.size,2)});

test('speaker options retain actor identity and known plugin voice type',()=>{const plugin=Buffer.concat([rec('TES4',0,sub('MAST',Buffer.from('Skyrim.esm\0'))),rec('VTYP',0x01000800,sub('EDID',Buffer.from('HeroVoice\0'))),npc(0x01000810,'Bjorn',0x01000800),npc(0x00000811,'MasterNPC',0x01000800)]);const identified=parseSpeakerOptions(plugin);assert.deepEqual(identified,[{formId:'01000810',name:'Bjorn',editorId:'BjornNPC',voiceType:'HeroVoice'}])});
