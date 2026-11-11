import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {scanVoiceFiles,voicesFor} from '../backend/src/voice-files.js';
test('voice lookup matches plugin-owned INFO and response and keeps distinct voices',async()=>{const dir=await mkdtemp(path.join(tmpdir(),'follower-voices-'));try{await mkdir(path.join(dir,'voice-a'));await mkdir(path.join(dir,'voice-b'));await writeFile(path.join(dir,'voice-a','quest_topic_00012345_1.wav'),'a');await writeFile(path.join(dir,'voice-b','quest_topic_00012345_1.WAV'),'b');await writeFile(path.join(dir,'voice-a','quest_topic_00012345_2.wav'),'c');await writeFile(path.join(dir,'voice-a','quest_topic_00012345_1.fuz'),'x');const index=await scanVoiceFiles(dir);assert.deepEqual(voicesFor(index,'05012345',1,5).map(v=>v.voice),['voice-a','voice-b']);assert.equal(voicesFor(index,'05012345',2,5).length,1);assert.equal(voicesFor(index,'00012345',1,5).length,0);assert.equal(voicesFor(index,'05012346',1,5).length,0)}finally{await rm(dir,{recursive:true,force:true})}});
