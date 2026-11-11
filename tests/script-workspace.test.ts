import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createScriptWorkspace } from '../backend/src/script-workspace.js';

test('script operations validate changes, back up files and install only a successful build',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'follower-script-workspace-'));
 try{
  const data=path.join(root,'Data'),sourceDir=path.join(data,'Source','Scripts'),mirrorDir=path.join(data,'Scripts','Source'),runtimeDir=path.join(data,'Scripts');
  await mkdir(sourceDir,{recursive:true});await mkdir(mirrorDir,{recursive:true});
  const source=path.join(sourceDir,'Example.psc'),mirror=path.join(mirrorDir,'Example.psc'),runtime=path.join(runtimeDir,'Example.pex');
  await writeFile(source,'Scriptname Example\r\n; old\r\n');await writeFile(mirror,'old mirror');await writeFile(runtime,'old binary');
  const workspace=createScriptWorkspace({dataDirectory:data,backupDirectory:path.join(root,'backups'),resolveScript:async(_plugin,name)=>{if(name!=='Example.psc')throw new Error('Unknown script');return {name,text:''}},compileProcess:async({source:input,outputDirectory})=>{const text=await readFile(input,'utf8');if(text.includes('INVALID'))throw Object.assign(new Error('Compilation failed'),{stderr:'Syntax error'});await writeFile(path.join(outputDirectory,'Example.pex'),'new binary');return {stdout:'Compiled'}}});
  const loaded=await workspace.get('plugin.esp','Example.psc');const manual=await workspace.backup('plugin.esp','Example.psc');assert.match(await readFile(path.join(manual.path,'source.psc'),'utf8'),/old/);
  await assert.rejects(workspace.save('plugin.esp','Example.psc','INVALID',loaded.version),/Syntax error/);assert.match(await readFile(source,'utf8'),/old/);assert.equal(await readFile(runtime,'utf8'),'old binary');
  const saved=await workspace.save('plugin.esp','Example.psc','Scriptname Example\n; updated\n',loaded.version);assert.equal(await readFile(source,'utf8'),'Scriptname Example\r\n; updated\r\n');assert.equal(await readFile(mirror,'utf8'),await readFile(source,'utf8'));assert.match(await readFile(path.join(saved.backupPath,'source.psc'),'utf8'),/old/);assert.equal(await readFile(runtime,'utf8'),'old binary');
  await assert.rejects(workspace.compile('plugin.esp','Example.psc',loaded.version),/changed on disk/);
  const built=await workspace.compile('plugin.esp','Example.psc',saved.version);assert.equal(await readFile(runtime,'utf8'),'new binary');assert.equal(await readFile(path.join(built.backupPath,'runtime.pex'),'utf8'),'old binary');assert.equal(built.output,'Compiled');
 }finally{await rm(root,{recursive:true,force:true})}
});
