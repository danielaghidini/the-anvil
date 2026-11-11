import test from 'node:test';
import assert from 'node:assert/strict';
import {tokenizePapyrus} from '../shared/papyrus.js';
test('Papyrus highlighting keeps the source text and identifies code, strings and comments',()=>{const source='Scriptname Test extends Quest\nInt Property Value = 42 Auto ; note\nDebug.Trace("<hello>")';const tokens=tokenizePapyrus(source);assert.equal(tokens.map(t=>t.text).join(''),source);for(const [text,kind] of [['Scriptname','keyword'],['Int','type'],['42','number'],['; note','comment'],['"<hello>"','string']])assert.equal(tokens.find(t=>t.text===text)?.kind,kind)});
