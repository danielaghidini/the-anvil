import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { encodeResetHours, readDialogueTiming } from './dialogue-timing.mjs';
import {
  scan,
  subrecords,
  sub,
  fail,
  replacePlugin,
  ensureEditorClosed,
  isDraftGate,
  idBuffer,
} from './stage-dialogue.mjs';

function findDialogue(original, input) {
  if (
    !/^[0-9a-f]{8}$/i.test(input.info || '') ||
    !/^[0-9a-f]{8}$/i.test(input.questFormId || '') ||
    !Number.isInteger(input.response) ||
    input.response < 0 ||
    input.response > 255 ||
    typeof input.expectedText !== 'string'
  )
    fail(400, 'Invalid dialogue parameters.');
  const all = scan(original),
    header = all.find((r) => r.type === 'TES4');
  if (!header || header.flags & (0x80 | 0x200))
    fail(422, 'Editing localized or master plugins is not supported.');
  const masters = subrecords(header.data).filter((f) => f.type === 'MAST').length;
  const matches = all.filter((r) => r.type === 'INFO' && r.id === parseInt(input.info, 16));
  if (!matches.length || (matches.length === 1 && matches[0].flags & 0x20))
    fail(404, 'Dialogue response not found.');
  if (matches.length !== 1 || matches[0].id >>> 24 !== masters)
    fail(422, 'Only dialogue owned by this plugin can be edited.');
  const info = matches[0],
    group = info.parent;
  if (!group || group.type !== 'GRUP' || group.groupType !== 7) fail(422, 'Unsupported dialogue layout.');
  const topics = all.filter((r) => r.type === 'DIAL' && r.id === group.label && !(r.flags & 0x20));
  if (
    topics.length !== 1 ||
    !subrecords(topics[0].data).some(
      (f) =>
        f.type === 'QNAM' &&
        f.value.length === 4 &&
        f.value.readUInt32LE() === parseInt(input.questFormId, 16),
    )
  )
    fail(404, 'Dialogue does not belong to this quest.');
  const fields = subrecords(info.data);
  let response, field, responseStart;
  for (const part of fields) {
    if (part.type === 'TRDT') response = part;
    else if (part.type === 'NAM1' && response) {
      if (response.value.length > 12 && response.value[12] === input.response) {
        if (field) fail(422, 'Duplicate dialogue response.');
        field = part;
        responseStart = response;
      }
      response = undefined;
    }
  }
  if (!field) fail(404, 'Dialogue response not found.');
  const bytes = field.value.subarray(
    0,
    field.value.indexOf(0) < 0 ? field.value.length : field.value.indexOf(0),
  );
  const utf = bytes.toString('utf8');
  const previous = (utf.includes('�') ? new TextDecoder('windows-1252').decode(bytes) : utf).trim();
  if (previous !== input.expectedText)
    fail(409, 'Dialogue changed since it was loaded. Refresh and try again.');
  return { all, header, info, group, topic: topics[0], fields, field, responseStart, previous };
}

function encodeRecord(original, record, payload) {
  let data = payload;
  if (record.flags & 0x40000) {
    const length = Buffer.alloc(4);
    length.writeUInt32LE(payload.length);
    data = Buffer.concat([length, deflateSync(payload)]);
  }
  const head = Buffer.from(original.subarray(record.offset, record.offset + 24));
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data]);
}

function replaceRecord(original, record, bytes) {
  const modified = Buffer.concat([
    original.subarray(0, record.offset),
    bytes,
    original.subarray(record.next),
  ]);
  const delta = bytes.length - (record.next - record.offset);
  for (let parent = record.parent; parent; parent = parent.parent)
    modified.writeUInt32LE(original.readUInt32LE(parent.offset + 4) + delta, parent.offset + 4);
  return modified;
}

export function editDialogue(
  file,
  backupDirectory,
  input,
  assertEditorClosed = ensureEditorClosed,
  approve = false,
) {
  assertEditorClosed();
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (!text || text.length > 150 || !/^[\x20-\x7e]+$/.test(text))
    fail(400, 'Enter 1–150 ASCII characters for the dialogue.');
  const original = readFileSync(file);
  const { info, fields, field, previous } = findDialogue(original, input);
  let payload;
  if (approve) {
    const gate = fields.filter((part) => part.type === 'CTDA' && isDraftGate(part.value));
    if (gate.length !== 1 || fields.filter((part) => part.type === 'NAM1').length !== 1)
      fail(409, 'This line is no longer pending voice approval. Refresh and try again.');
    const { offset, value } = gate[0];
    payload = Buffer.concat([info.data.subarray(0, offset), info.data.subarray(offset + 6 + value.length)]);
  } else {
    if (previous === text) return { text, unchanged: true };
    payload = Buffer.concat([
      info.data.subarray(0, field.offset),
      sub('NAM1', Buffer.from(text + '\0', 'ascii')),
      info.data.subarray(field.offset + 6 + field.value.length),
    ]);
  }
  const modified = replaceRecord(original, info, encodeRecord(original, info, payload));
  const backup = replacePlugin(file, backupDirectory, original, modified);
  return { text, backup };
}

export function editDialogueTiming(file, backupDirectory, input, assertEditorClosed = ensureEditorClosed) {
  assertEditorClosed();
  if (
    typeof input.sayOnce !== 'boolean' ||
    typeof input.expectedSayOnce !== 'boolean' ||
    typeof input.resetHours !== 'number' ||
    !Number.isFinite(input.resetHours) ||
    input.resetHours < 0 ||
    typeof input.expectedResetHours !== 'number' ||
    !Number.isFinite(input.expectedResetHours) ||
    input.expectedResetHours < 0
  )
    fail(400, 'Invalid dialogue timing.');
  const original = readFileSync(file);
  const { info, fields } = findDialogue(original, input);
  const enam = fields.filter((part) => part.type === 'ENAM');
  const legacy = fields.filter((part) => part.type === 'DATA');
  if (enam.length > 1 || legacy.length > 1 || (enam.length && legacy.length))
    fail(422, 'Unsupported dialogue timing layout.');
  const current = readDialogueTiming(enam[0]?.value, legacy[0]?.value);
  if (!current) fail(422, 'Unsupported dialogue timing layout.');
  if (current.resetHours !== input.expectedResetHours || current.sayOnce !== input.expectedSayOnce)
    fail(409, 'Dialogue timing changed since it was loaded. Refresh and try again.');
  const existing = enam[0] ?? legacy[0];
  const value = existing ? Buffer.from(existing.value) : Buffer.alloc(4);
  const flagOffset = current.timingFormat === 'legacy' ? 2 : 0;
  value.writeUInt16LE((value.readUInt16LE(flagOffset) & ~4) | (input.sayOnce ? 4 : 0), flagOffset);
  if (current.timingFormat === 'legacy') {
    if (!Number.isFinite(Math.fround(input.resetHours / 24))) fail(400, 'Reset hours are too large.');
    value.writeFloatLE(input.resetHours / 24, 4);
  } else value.writeUInt16LE(encodeResetHours(input.resetHours), 2);
  const timing = readDialogueTiming(
    current.timingFormat === 'compact' ? value : undefined,
    current.timingFormat === 'legacy' ? value : undefined,
  );
  if ((existing && existing.value.equals(value)) || (!existing && input.resetHours === 0 && !input.sayOnce))
    return { ...timing, unchanged: true };
  // Insert missing ENAM after script metadata, before the remaining INFO fields.
  const offset =
    existing?.offset ??
    fields.find((part) => !['EDID', 'VMAD'].includes(part.type))?.offset ??
    info.data.length;
  const payload = Buffer.concat([
    info.data.subarray(0, offset),
    sub(existing?.type ?? 'ENAM', value),
    info.data.subarray(offset + (existing ? existing.value.length + 6 : 0)),
  ]);
  const modified = replaceRecord(original, info, encodeRecord(original, info, payload));
  return { ...timing, backup: replacePlugin(file, backupDirectory, original, modified) };
}

export function deleteDialogue(file, backupDirectory, input, assertEditorClosed = ensureEditorClosed) {
  assertEditorClosed();
  const original = readFileSync(file);
  const { all, header, info, group, topic, fields, field, responseStart } = findDialogue(original, input);
  if (fields.filter((part) => part.type === 'TRDT').length > 1) {
    const start = fields.indexOf(responseStart);
    const textIndex = fields.indexOf(field);
    if (textIndex !== start + 1) fail(422, 'Unsupported dialogue response layout.');
    let end = textIndex + 1;
    while (['NAM2', 'NAM3', 'SNAM', 'LNAM'].includes(fields[end]?.type)) end++;
    const payload = Buffer.concat([
      info.data.subarray(0, responseStart.offset),
      info.data.subarray(fields[end]?.offset ?? info.data.length),
    ]);
    const modified = replaceRecord(original, info, encodeRecord(original, info, payload));
    return { backup: replacePlugin(file, backupDirectory, original, modified) };
  }

  const previous = fields.find((part) => part.type === 'PNAM');
  if (previous && (previous.value.length !== 4 || previous.value.readUInt32LE() === info.id))
    fail(422, 'Unsupported dialogue order.');
  const changes = [{ record: info, bytes: Buffer.alloc(0) }];
  const infoId = idBuffer(info.id);
  for (const record of all) {
    if (record.type !== 'INFO' || record === info || record.flags & 0x20 || !record.data.includes(infoId))
      continue;
    const links = subrecords(record.data).filter((part) => part.value.equals(infoId));
    if (links.some((part) => part.type === 'DNAM'))
      fail(409, 'Another dialogue uses this line as shared response data.');
    const link = links.find((part) => part.type === 'PNAM');
    if (!link) continue;
    if (record.parent !== group || previous?.value.readUInt32LE() === record.id)
      fail(422, 'Unsupported dialogue order.');
    const data = Buffer.from(record.data);
    data.writeUInt32LE(previous?.value.readUInt32LE() ?? 0, link.offset + 6);
    changes.push({ record, bytes: encodeRecord(original, record, data) });
  }
  const hedr = subrecords(header.data).find((part) => part.type === 'HEDR');
  if (hedr?.value.length !== 12 || hedr.value.readUInt32LE(4) === 0)
    fail(422, 'Unsupported plugin record count.');
  const headerData = Buffer.from(header.data);
  headerData.writeUInt32LE(hedr.value.readUInt32LE(4) - 1, hedr.offset + 10);
  changes.push({ record: header, bytes: encodeRecord(original, header, headerData) });
  const count = subrecords(topic.data).find((part) => part.type === 'TIFC');
  if (count) {
    if (count.value.length !== 4 || count.value.readUInt32LE() === 0)
      fail(422, 'Unsupported topic record count.');
    const topicData = Buffer.from(topic.data);
    topicData.writeUInt32LE(count.value.readUInt32LE() - 1, count.offset + 6);
    changes.push({ record: topic, bytes: encodeRecord(original, topic, topicData) });
  }
  // Work from the end so every remaining record and parent keeps its original offset.
  let modified = original;
  for (const { record, bytes } of changes.sort((a, b) => b.record.offset - a.record.offset))
    modified = replaceRecord(modified, record, bytes);
  return { backup: replacePlugin(file, backupDirectory, original, modified) };
}
