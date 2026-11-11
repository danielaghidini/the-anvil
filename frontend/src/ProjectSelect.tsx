import { ChevronDown } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Project } from '../../shared/types';
export function ProjectSelect({ projects, selected, onSelect }: { projects: Project[]; selected: number | null; onSelect: (id:number) => void }) {
 const ref=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{const close=(event:MouseEvent)=>{if(ref.current && !ref.current.contains(event.target as Node))ref.current.open=false;};document.addEventListener('click',close);return()=>document.removeEventListener('click',close)},[]);
 return <div className="project-switch"><span id="project-select-label">Project</span><details className="project-picker" ref={ref} onKeyDown={e=>{if(e.key==='Escape'&&ref.current){ref.current.open=false;ref.current.querySelector('summary')?.focus()}}}><summary aria-labelledby="project-select-label project-select-value"><span id="project-select-value">{projects.find(p=>p.id===selected)?.name ?? 'No projects'}</span><ChevronDown size={18} strokeWidth={1.7} aria-hidden="true"/></summary><div className="project-options" aria-label="Projects">{projects.length?projects.map(p=><button type="button" key={p.id} className={p.id===selected?'selected':''} aria-current={p.id===selected?'true':undefined} onClick={()=>{onSelect(p.id);if(ref.current)ref.current.open=false}}>{p.name}</button>):<p>No projects</p>}</div></details></div>;
}
