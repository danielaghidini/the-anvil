import { readFileSync, writeFileSync, copyFileSync, renameSync, unlinkSync, constants, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const digest = value => createHash('sha256').update(value).digest('hex');
function subrecords(data) {
 const result = []; let offset = 0;
 while (offset < data.length) {
  if (offset + 6 > data.length) fail(422, 'Invalid plugin subrecord.');
  const type = data.toString('ascii', offset, offset + 4), size = data.readUInt16LE(offset + 4);
  if (type === 'XXXX' || offset + 6 + size > data.length) fail(422, 'Unsupported plugin subrecord.');
  result.push({ type, offset, value: data.subarray(offset + 6, offset + 6 + size) }); offset += 6 + size;
 }
 return result;
}
function scan(buffer) {
 const out = [];
 function walk(start, end, parent = null) {
  for (let offset = start; offset < end;) {
   if (offset + 24 > end) fail(422, 'Invalid plugin header.');
   const type = buffer.toString('ascii', offset, offset + 4), size = buffer.readUInt32LE(offset + 4);
   const next = offset + size + (type === 'GRUP' ? 0 : 24);
   if (next <= offset + 23 || next > end) fail(422, 'Invalid plugin record size.');
   const record = { type, offset, next, parent };
   if (type === 'GRUP') {
    record.label = buffer.readUInt32LE(offset + 8); record.groupType = buffer.readInt32LE(offset + 12);
    out.push(record); walk(offset + 24, next, record);
   } else {
    record.id = buffer.readUInt32LE(offset + 12); record.flags = buffer.readUInt32LE(offset + 8);
    const raw = buffer.subarray(offset + 24, next);
    record.data = record.flags & 0x40000 ? inflateSync(raw.subarray(4)) : raw;
    out.push(record);
   }
   offset = next;
  }
 }
 walk(0, buffer.length); return out;
}
function sub(type, value) {
 const h = Buffer.alloc(6); h.write(type, 0, 4, 'ascii'); h.writeUInt16LE(value.length, 4); return Buffer.concat([h, value]);
}
function idBuffer(value) { const b = Buffer.alloc(4); b.writeUInt32LE(value); return b; }
const operators = { eq: 0x00, ne: 0x20, gt: 0x40, gte: 0x60, lt: 0x80, lte: 0xa0 };
const functions = { GetStage: 58, GetStageDone: 59, GetQuestRunning: 56, GetCurrentTime: 18, GetDead: 46, GetSleeping: 49, GetTalkedToPC: 50, IsRaining: 62, IsSnowing: 75, GetRandomPercent: 77, GetLevel: 80, IsSwimming: 185, IsInDialogueWithPlayer: 249, IsSneaking: 286, IsRunning: 287, IsInInterior: 300, GetCombatState: 323 };
export function encodeIdleCondition(quest, c) {
 const value = Buffer.alloc(32); value[0] = operators[c.operator]; value.writeFloatLE(c.value, 4);
 value.writeUInt16LE(functions[c.function], 8);
 if (['GetStage', 'GetStageDone', 'GetQuestRunning'].includes(c.function)) value.writeUInt32LE(quest, 12);
 if (c.function === 'GetStageDone') value.writeUInt32LE(c.stage, 16);
 if (c.runOn === 'player') { value.writeUInt32LE(2, 20); value.writeUInt32LE(0x14, 24); }
 value.writeUInt32LE(0xffffffff, 28);
 return sub('CTDA', value);
}
function ensureEditorClosed() {
 if (process.platform === 'win32') {
  let processes;
  try { processes = execFileSync('tasklist.exe', ['/FI', 'IMAGENAME eq CreationKit.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true }); }
  catch { fail(503, 'Could not check whether Creation Kit is open. Close it and try again.'); }
  if (/"CreationKit\.exe"/i.test(processes)) fail(409, 'Close Creation Kit before writing to the plugin.');
 }
}
export function createStageDialogue(file, backupDirectory, input, assertEditorClosed = ensureEditorClosed, installVoice) {
 assertEditorClosed();
 const dialogue = typeof input.text === 'string' ? input.text.trim() : '';
 if (!dialogue || dialogue.length > 150 || !/^[\x20-\x7e]+$/.test(dialogue)) fail(400, 'Enter 1–150 ASCII characters for the dialogue.');
 if (!/^[0-9a-f]{8}$/i.test(input.speakerFormId || '') || input.type !== 'IDLE' || !/^[0-9a-f]{8}$/i.test(input.ownerFormId) || !/^[0-9a-f]{8}$/i.test(input.gameFormId) || !Number.isInteger(input.stage) || input.stage < 0 || input.stage > 65535) fail(400, 'Invalid dialogue parameters.');
 const emotionType = input.emotionType ?? 0, emotionValue = input.emotionValue ?? 0;
 if (!Number.isInteger(emotionType) || emotionType < 0 || emotionType > 7 || !Number.isInteger(emotionValue) || emotionValue < 0 || emotionValue > 100) fail(400, 'Invalid emotion type or value.');
 const conditions = input.conditions ?? [];
 if (!Array.isArray(conditions) || conditions.length > 9) fail(400, 'Choose up to nine additional conditions.');
 for (const c of conditions) {
  if (!c || !Object.hasOwn(functions, c.function) || !Object.hasOwn(operators, c.operator) || !['subject','player'].includes(c.runOn) || typeof c.value !== 'number' || !Number.isFinite(c.value) || Math.abs(c.value) > 1000000 || (c.function === 'GetStage' && (!Number.isInteger(c.value) || c.value < 0 || c.value > 65535)) || (c.function === 'GetStageDone' && (!Number.isInteger(c.stage) || c.stage < 0 || c.stage > 65535))) fail(400, 'Invalid condition.');
 }
 const original = readFileSync(file), all = scan(original);
 const header = all.find(r => r.type === 'TES4'), questId = parseInt(input.gameFormId, 16), ownerId = parseInt(input.ownerFormId, 16);
 const topics = all.filter(r => r.type === 'DIAL' && !(r.flags & 0x20) && subrecords(r.data).some(s => s.type === 'QNAM' && s.value.length === 4 && s.value.readUInt32LE() === ownerId) && subrecords(r.data).some(s => s.type === 'SNAM' && s.value.toString('ascii').replace(/\0+$/, '') === input.type));
 if (topics.length !== 1) fail(422, `The destination quest must have exactly one existing ${input.type === 'IDLE' ? 'Idle' : 'Hello'} topic.`);
 const topic = topics[0], topicId = topic.id;
 const topicName = subrecords(topic.data).find(s => s.type === 'EDID')?.value.toString('utf8').replace(/\0.*$/s, '') ?? ''; 
 const group = all.find(r => r.type === 'GRUP' && r.groupType === 7 && r.label === topicId);
 if (!header || !group || (topic.flags & 0x40000) || (header.flags & (0x40000 | 0x200 | 0x80))) fail(422, 'Unsupported plugin layout.');
 const info = all.filter(r => r.type === 'INFO' && r.parent === group && !(r.flags & 0x20));
 const prior = new Set(info.map(r => subrecords(r.data).find(s => s.type === 'PNAM')?.value).filter(b => b?.length === 4).map(b => b.readUInt32LE(0)));
 const last = info.filter(r => !prior.has(r.id));
 if (last.length !== 1) fail(422, 'Unable to determine the existing Idle response order.');
 const headFields = subrecords(header.data), masters = headFields.filter(s => s.type === 'MAST').length;
 const hedr = headFields.find(s => s.type === 'HEDR');
 const count = subrecords(topic.data).find(s => s.type === 'TIFC');
 if (!hedr || hedr.value.length !== 12 || !count || count.value.length !== 4 || masters > 253) fail(422, 'Unsupported plugin metadata.');
 const used = new Set(all.filter(r => r.type !== 'GRUP').map(r => r.id));
 let local = hedr.value.readUInt32LE(8); if (local < 0x800) local = 0x800;
 let newId = ((masters << 24) | local) >>> 0;
 while (local <= 0xffffff && used.has(newId)) { local++; newId = ((masters << 24) | local) >>> 0; }
 if (local >= 0xffffff) fail(422, 'No free Form IDs available.');
 const trdt = Buffer.from('000000000000000000000000010000000000000001000000', 'hex');
 trdt.writeUInt32LE(emotionType, 0); trdt.writeUInt32LE(emotionValue, 4);
 const payload = Buffer.concat([sub('ENAM', Buffer.from('06000000','hex')), sub('PNAM', idBuffer(last[0].id)), sub('CNAM', Buffer.from([0])), sub('TRDT', trdt), sub('NAM1', Buffer.from(dialogue + '\0', 'ascii')), sub('NAM2', Buffer.from([0])), sub('NAM3', Buffer.from([0])), encodeIdleCondition(questId, { function: 'GetStage', operator: 'eq', value: input.stage, runOn: 'subject' }), ...conditions.map(c => encodeIdleCondition(questId, c)), sub('ANAM', idBuffer(parseInt(input.speakerFormId,16)))]);
 const rh = Buffer.alloc(24); rh.write('INFO'); rh.writeUInt32LE(payload.length, 4); rh.writeUInt32LE(newId, 12);
 original.copy(rh, 16, last[0].offset + 16, last[0].offset + 24);
 const record = Buffer.concat([rh, payload]);
 const modified = Buffer.concat([original.subarray(0, group.next), record, original.subarray(group.next)]);
 for (let parent = group; parent; parent = parent.parent) modified.writeUInt32LE(original.readUInt32LE(parent.offset + 4) + record.length, parent.offset + 4);
 modified.writeUInt32LE(hedr.value.readUInt32LE(4) + 1, header.offset + 24 + hedr.offset + 6 + 4);
 modified.writeUInt32LE(local + 1, header.offset + 24 + hedr.offset + 6 + 8);
 modified.writeUInt32LE(count.value.readUInt32LE(0) + 1, topic.offset + 24 + count.offset + 6);
 mkdirSync(backupDirectory, { recursive: true });
 const token = randomUUID(), backup = path.join(backupDirectory, `${path.basename(file)}.${token}.bak`), temp = path.join(path.dirname(file), `.${path.basename(file)}.${token}.tmp`);
 copyFileSync(file, backup, constants.COPYFILE_EXCL);
 if (digest(readFileSync(backup)) !== digest(original) || digest(readFileSync(file)) !== digest(original)) fail(409, 'The plugin changed during preparation. Try again.');
 try { writeFileSync(temp, modified, { flag: 'wx' }); if (digest(readFileSync(file)) !== digest(original)) fail(409, 'The plugin changed during preparation. Try again.'); renameSync(temp, file); }
 finally { try { unlinkSync(temp); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
 const infoId = newId.toString(16).padStart(8, '0');
 if (installVoice) try { installVoice(infoId, topicName); } catch (error) {
  if (digest(readFileSync(file)) !== digest(modified)) fail(500, `The plugin was modified concurrently after INFO ${infoId} was created. Do not retry; restore from ${backup} after reviewing.`);
  const restore = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.restore.tmp`);
  try { writeFileSync(restore, original, {flag:'wx'}); renameSync(restore, file); } catch { fail(500, `The voice could not be installed and plugin rollback failed. Do not retry; restore from ${backup}.`); } finally { try { unlinkSync(restore); } catch {} }
  throw error;
 }
 return { info: infoId, backup, text: dialogue };
}
