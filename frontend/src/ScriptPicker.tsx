import { ChevronDown, Search } from 'lucide-react';
import { useRef, useState } from 'react';

type Script = { name:string; available:boolean };
export function ScriptPicker({scripts,selected,loading,onSelect}:{scripts:Script[];selected?:string;loading:boolean;onSelect:(name:string)=>void}) {
 const ref=useRef<HTMLDetailsElement>(null);
 const [query,setQuery]=useState('');
 const filtered=scripts.filter(script=>script.name.toLowerCase().includes(query.toLowerCase()));
 return <div className="script-filter"><details className="assignment-picker" ref={ref} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))e.currentTarget.open=false}} onKeyDown={e=>{if(e.key==='Escape'&&ref.current){ref.current.open=false;ref.current.querySelector('summary')?.focus()}}}>
  <summary aria-label="Select a script"><span>{loading?'Loading scripts…':selected||'Select a script'}</span><ChevronDown size={17} aria-hidden="true"/></summary>
  <div className="assignment-options"><label className="search script-picker-search"><Search size={17} aria-hidden="true"/><input aria-label="Search scripts" placeholder="Search scripts..." value={query} onChange={e=>setQuery(e.target.value)}/></label>{filtered.length?filtered.map(script=><button type="button" key={script.name} disabled={!script.available} title={script.available?script.name:'Source file not found'} className={selected===script.name?'selected':''} aria-current={selected===script.name?'true':undefined} onClick={()=>{if(ref.current)ref.current.open=false;setQuery('');onSelect(script.name)}}>{script.name}{!script.available?' (source unavailable)':''}</button>):<p className="script-picker-empty">{loading?'Loading scripts…':'No scripts found.'}</p>}</div>
 </details></div>;
}
