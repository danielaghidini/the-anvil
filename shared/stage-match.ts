export interface StageCondition { function:'GetStage'|'GetStageDone'; questFormId:string; operator:string; value:number; stage?:number; or:boolean }
export function stageMatchesDirectConditions(stage:number, questFormId:string, conditions:StageCondition[]):boolean {
 const direct=conditions.filter(c=>c.questFormId===questFormId&&c.function==='GetStage');
 return direct.length>0&&direct.every(c=>!c.or&&({'=':stage===c.value,'≠':stage!==c.value,'>':stage>c.value,'≥':stage>=c.value,'<':stage<c.value,'≤':stage<=c.value} as Record<string,boolean>)[c.operator]===true);
}
