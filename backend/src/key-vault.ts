import { spawn } from 'node:child_process';
const script = `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$inputValue = [Console]::In.ReadToEnd().Trim()
$bytes = [Convert]::FromBase64String($inputValue)
if ($args[0] -eq 'protect') { $result = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser) }
elseif ($args[0] -eq 'unprotect') { $result = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser) }
else { throw 'Invalid operation' }
[Console]::Out.Write([Convert]::ToBase64String($result))`;
async function transform(operation:'protect'|'unprotect',value:Buffer):Promise<Buffer>{
 if(process.platform!=='win32')throw Object.assign(new Error('Saving AI keys requires Windows.'),{statusCode:503});
 return await new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script.replaceAll('$args[0]', `'${operation}'`)],{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='';child.stdout.setEncoding('utf8');child.stdout.on('data',(chunk:string)=>{output+=chunk;if(output.length>100000)child.kill()});child.stderr.resume();child.on('error',()=>reject(new Error('Could not access Windows credential protection.')));child.on('close',code=>{if(code!==0||!output||!/^[A-Za-z0-9+/=]+$/.test(output))return reject(new Error('Could not access Windows credential protection.'));resolve(Buffer.from(output,'base64'));});child.stdin.on('error',()=>{});child.stdin.end(value.toString('base64'));});
}
export async function protectKey(key:string):Promise<string>{return (await transform('protect',Buffer.from(key,'utf8'))).toString('base64');}
export async function unprotectKey(secret:string):Promise<string>{return (await transform('unprotect',Buffer.from(secret,'base64'))).toString('utf8');}
