import test from 'node:test';
import assert from 'node:assert/strict';
import { groupStageDialogues, filterStageDialogues, objectiveStageMap } from '../shared/skyrim-dialogue.js';
import type { StageCondition } from '../shared/stage-match.js';
test('Skyrim stage filters stay within selected stages and search dialogue text',()=>{
 const condition=(questFormId:string,operator:string,value:number):StageCondition=>({function:'GetStage',questFormId,operator,value,or:false});
 const lines=[{text:'Talk to Farengar',conditions:[condition('ABC','≥',10),condition('ABC','≤',20)]},{text:'A different quest',conditions:[condition('OTHER','=',30)]},{text:'Done elsewhere',conditions:[{function:'GetStageDone' as const,questFormId:'ABC',operator:'=',value:1,stage:30,or:false}]}];
 const groups=groupStageDialogues([30,20,10,0],'ABC',lines);
 assert.deepEqual(groups.map(g=>g.number),[0,10,20,30]);assert.deepEqual(groups.map(g=>g.lines.length),[0,1,1,0]);
 assert.deepEqual(filterStageDialogues(groups,'','missing','').map(g=>g.number),[0,30]);
 assert.deepEqual(filterStageDialogues(groups,'10','present','farengar').map(g=>g.number),[10]);
 assert.equal(filterStageDialogues(groups,'30','','farengar').length,0);
 assert.equal(filterStageDialogues(groups,'10','','different quest').length,0);
});

test('objective filter uses explicit catalog mappings without guessing objective-only entries',()=>{const mapped=objectiveStageMap(['160 / obj. 30','255 / obj. 60','255 / obj. 65','315, 317, 350 / obj. 70','Obj. 50','Geral da quest']);assert.deepEqual(mapped.get(255),[60,65]);assert.deepEqual(mapped.get(317),[70]);assert.equal(mapped.has(50),false);const groups=groupStageDialogues([10,160,255,317,999],'ABC',[]);assert.deepEqual(filterStageDialogues(groups,'','objectives','',new Set(mapped.keys())).map(x=>x.number),[160,255,317]);assert.deepEqual(filterStageDialogues(groups,'','','',new Set(mapped.keys())).map(x=>x.number),[10,160,255,317,999]);});

test('dialogue count sorting includes empty stages and uses visible search results',()=>{const groups=[{number:10,lines:[{text:'Hello',conditions:[]},{text:'Bye',conditions:[]}]},{number:20,lines:[]},{number:30,lines:[{text:'Hello again',conditions:[]}]},{number:40,lines:[{text:'Bye again',conditions:[]}]}];assert.deepEqual(filterStageDialogues(groups,'','most','').map(g=>g.number),[10,30,40,20]);assert.deepEqual(filterStageDialogues(groups,'','fewest','').map(g=>g.number),[20,30,40,10]);assert.deepEqual(filterStageDialogues(groups,'','most','hello').map(g=>g.number),[10,30]);assert.deepEqual(groups.map(g=>g.number),[10,20,30,40]);});
