import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const picker = `
Add-Type -AssemblyName System.Windows.Forms
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$dialog = [System.Windows.Forms.OpenFileDialog]::new()
$dialog.Title = 'Select a plugin'
$dialog.Filter = 'Skyrim plugins (*.esp;*.esm)|*.esp;*.esm|All files (*.*)|*.*'
$dialog.CheckFileExists = $true
$dialog.Multiselect = $false
$defaultPath = Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Steam\\steamapps\\common\\Skyrim Special Edition\\Data'
if (Test-Path -LiteralPath $defaultPath) { $dialog.InitialDirectory = $defaultPath }
$owner = [System.Windows.Forms.Form]::new()
$owner.TopMost = $true
try {
 if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::Out.Write($dialog.FileName)
 }
} finally { $owner.Dispose(); $dialog.Dispose() }
`;
export async function selectPluginFile(runner:typeof exec = exec):Promise<string|null> {
 if(process.platform!=='win32') throw Object.assign(new Error('File browsing is currently available on Windows. Enter the full path instead.'),{statusCode:501});
 const {stdout} = await runner('powershell.exe',['-NoProfile','-NonInteractive','-STA','-Command',picker],{encoding:'utf8',windowsHide:true,timeout:600000,maxBuffer:16384});
 return stdout.trim() || null;
}
