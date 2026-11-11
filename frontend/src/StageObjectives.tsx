export function StageObjectives({numbers,texts}:{numbers:number[]|undefined;texts:Record<string,string>|undefined}){
 if(!numbers?.length)return null;
 return <div className="stage-objectives">{numbers.map(number=><p key={number}><span>Objective {number}</span>{texts?.[number]?` · ${texts[number]}`:' · Text unavailable'}</p>)}</div>;
}
