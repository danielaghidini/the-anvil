type Stage = {number:number;lines:unknown[]};
export function QuestCoverage({stages}:{stages:Stage[]}){
 if(!stages.length)return null;
 const covered=stages.filter(stage=>stage.lines.length>0).length,total=stages.length,percent=Math.round(covered/total*100);
 return <div className="quest-coverage"><div className="quest-coverage-label"><span>Stages with direct dialogue · {covered} of {total}</span><strong>{percent}%</strong></div><div className="progress-track" role="progressbar" aria-label="Stages with direct dialogue" aria-valuemin={0} aria-valuemax={total} aria-valuenow={covered}><span style={{width:`${percent}%`}}/></div></div>;
}
