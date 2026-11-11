export type PapyrusToken = { text:string; kind?:'keyword'|'type'|'string'|'number'|'comment' };
const keywords = new Set('scriptname extends conditional const hidden native global property auto autoreadonly event endevent function endfunction state endstate if elseif else endif while endwhile return as import self parent true false none new length'.split(' '));
const types = new Set('bool int float string var'.split(' '));
const pattern = /;\/[\s\S]*?(?:\/;|$)|;[^\n]*|"(?:\\.|[^"\\])*"|\b(?:\d+(?:\.\d+)?|[A-Za-z_][A-Za-z_0-9]*)\b/g;
export function tokenizePapyrus(source:string):PapyrusToken[] {
 const result:PapyrusToken[]=[]; let position=0;
 for(const match of source.matchAll(pattern)) {const at=match.index;if(at>position)result.push({text:source.slice(position,at)});const text=match[0],lower=text.toLowerCase();const kind=text.startsWith(';')?'comment':text.startsWith('"')?'string':/^\d/.test(text)?'number':keywords.has(lower)?'keyword':types.has(lower)?'type':undefined;result.push(kind?{text,kind}:{text});position=at+text.length;}
 if(position<source.length)result.push({text:source.slice(position)});return result;
}
