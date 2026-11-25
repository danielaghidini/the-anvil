import { createHash } from 'node:crypto';
import { gameStrings } from './game-strings.js';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import type { PluginSnapshot } from '../../shared/types.js';
import { isDraftGate } from './stage-dialogue.mjs';
import { isCombatDialogue } from '../../shared/combat-dialogue.js';
import { readDialogueTiming } from './dialogue-timing.mjs';
import type { DialogueTimingFields } from '../../shared/dialogue-timing.js';
type RecordEntry = { type: string; id: number; topic?: number; data: Buffer };
type Field = [string, Buffer];
export function* fields(data: Buffer): Generator<Field> {
  let p = 0,
    large: number | undefined;
  while (p < data.length) {
    if (p + 6 > data.length) throw new Error('Invalid subrecord.');
    const type = data.toString('ascii', p, p + 4),
      size = data.readUInt16LE(p + 4);
    p += 6;
    if (type === 'XXXX' && size === 4) {
      if (p + 4 > data.length) throw new Error('Invalid extended subrecord.');
      large = data.readUInt32LE(p);
      p += 4;
      continue;
    }
    const end = p + (large ?? size);
    large = undefined;
    if (end > data.length) throw new Error('Invalid subrecord size.');
    yield [type, data.subarray(p, end)];
    p = end;
  }
}
export function* records(
  b: Buffer,
  start = 0,
  end = b.length,
  topic?: number,
  types: ReadonlySet<string> = new Set(['TES4', 'QUST', 'DIAL', 'INFO']),
): Generator<RecordEntry> {
  for (let p = start; p < end;) {
    if (p + 24 > end) throw new Error('Invalid record header.');
    const type = b.toString('ascii', p, p + 4),
      size = b.readUInt32LE(p + 4),
      next = p + size + (type === 'GRUP' ? 0 : 24);
    if (next <= p + 23 || next > end) throw new Error('Invalid record size.');
    if (type === 'GRUP') {
      const child = b.readUInt32LE(p + 12) === 7 ? b.readUInt32LE(p + 8) : topic;
      yield* records(b, p + 24, next, child, types);
    } else if (types.has(type) && !(b.readUInt32LE(p + 8) & 0x20)) {
      const flags = b.readUInt32LE(p + 8),
        raw = b.subarray(p + 24, next);
      yield {
        type,
        id: b.readUInt32LE(p + 12),
        topic,
        data: flags & 0x40000 ? inflateSync(raw.subarray(4)) : raw,
      };
    }
    p = next;
  }
}
function string(b: Buffer) {
  const end = b.indexOf(0),
    slice = end < 0 ? b : b.subarray(0, end),
    text = slice.toString('utf8');
  return text.includes('�') ? new TextDecoder('windows-1252').decode(slice) : text;
}
function first(f: Field[], name: string) {
  return f.find(([type]) => type === name)?.[1];
}
export interface DialogueLine extends DialogueTimingFields {
  info: string;
  response: number;
  text: string;
  topicType: string;
  topicCategory?: number;
  topicEditorId?: string;
  speaker?: string;
  pendingVoice?: boolean;
  emotionType?: number;
  emotionValue?: number;
  conditionSignature?: string;
  conditions: {
    function: 'GetStage' | 'GetStageDone';
    questFormId: string;
    operator: string;
    value: number;
    stage?: number;
    or: boolean;
  }[];
}
export function parseAllDialogue(buffer: Buffer): Map<string, DialogueLine[]> {
  const entries = [...records(buffer)],
    topics = new Map<number, { owner: string; type: string; editorId: string; category?: number }>();
  for (const rec of entries) {
    if (rec.type !== 'DIAL') continue;
    const f = [...fields(rec.data)],
      owner = first(f, 'QNAM');
    if (owner?.length === 4)
      topics.set(rec.id, {
        owner: owner.readUInt32LE().toString(16).padStart(8, '0').toUpperCase(),
        type: string(first(f, 'SNAM') ?? Buffer.alloc(0)) || 'Dialogue',
        category: first(f, 'DATA')?.[1],
        editorId: string(first(f, 'EDID') ?? Buffer.alloc(0)),
      });
  }
  const ops = ['=', '≠', '>', '≥', '<', '≤'],
    result = new Map<string, DialogueLine[]>();
  for (const rec of entries) {
    if (rec.type !== 'INFO' || rec.topic === undefined) continue;
    const topic = topics.get(rec.topic);
    if (!topic) continue;
    const f = [...fields(rec.data)],
      conditions: DialogueLine['conditions'] = [];
    const pendingVoice = f.some(([type, value]) => type === 'CTDA' && isDraftGate(value));
    const timing = readDialogueTiming(first(f, 'ENAM'), first(f, 'DATA'));
    const responseCount = f.filter(([type]) => type === 'TRDT').length;
    for (const [type, value] of f) {
      if (type !== 'CTDA' || value.length < 32) continue;
      const fn = value.readUInt16LE(8);
      if (fn !== 58 && fn !== 59) continue;
      const op = ops[(value[0] >> 5) & 7];
      if (!op || value[0] & 4) continue;
      conditions.push({
        function: fn === 58 ? 'GetStage' : 'GetStageDone',
        questFormId: value.readUInt32LE(12).toString(16).padStart(8, '0').toUpperCase(),
        operator: op,
        value: value.readFloatLE(4),
        ...(fn === 59 ? { stage: value.readUInt32LE(16) } : {}),
        or: Boolean(value[0] & 1),
      });
    }
    const conditionFields: Buffer[] = [];
    for (const [kind, value] of f) {
      if (kind === 'CTDA') conditionFields.push(Buffer.from(value));
      else if ((kind === 'CIS1' || kind === 'CIS2') && conditionFields.length) {
        // A string parameter lives in CIS1/CIS2. The Creation Kit fills the matching CTDA parameter
        // slot with a memory address that changes on every save, so hash the string instead.
        const last = conditionFields[conditionFields.length - 1],
          slot = kind === 'CIS1' ? 12 : 16;
        if (last.length >= slot + 4) last.fill(0, slot, slot + 4);
        conditionFields.push(Buffer.from(kind), value);
      }
    }
    const conditionSignature = conditionFields.length
      ? createHash('sha256').update(Buffer.concat(conditionFields)).digest('hex')
      : undefined;
    const speakerField = first(f, 'ANAM'),
      speaker =
        speakerField?.length === 4
          ? speakerField.readUInt32LE().toString(16).padStart(8, '0').toUpperCase()
          : undefined;
    let number: number | undefined, emotionType: number | undefined, emotionValue: number | undefined;
    for (const [type, value] of f) {
      if (type === 'TRDT') {
        number = value.length > 12 ? value[12] : undefined;
        emotionType = value.length >= 8 ? value.readUInt32LE(0) : undefined;
        emotionValue = value.length >= 8 ? value.readUInt32LE(4) : undefined;
      } else if (type === 'NAM1' && number !== undefined) {
        const text = string(value).trim();
        if (text || isCombatDialogue({ topicType: topic.type, topicCategory: topic.category })) {
          const lines = result.get(topic.owner) ?? [];
          lines.push({
            info: rec.id.toString(16).padStart(8, '0').toUpperCase(),
            response: number,
            text,
            topicType: topic.type,
            ...(timing ?? {}),
            timingEditable: !!timing && !(first(f, 'ENAM') && first(f, 'DATA')),
            responseCount,
            ...(topic.category !== undefined ? { topicCategory: topic.category } : {}),
            topicEditorId: topic.editorId,
            ...(speaker ? { speaker } : {}),
            ...(pendingVoice ? { pendingVoice } : {}),
            ...(emotionType ? { emotionType } : {}),
            ...(emotionValue ? { emotionValue } : {}),
            ...(conditionSignature ? { conditionSignature } : {}),
            conditions,
          });
          result.set(topic.owner, lines);
        }
        number = undefined;
      }
    }
  }
  return result;
}
export function parseDialogue(buffer: Buffer, questFormId: string): DialogueLine[] {
  return parseAllDialogue(buffer).get(questFormId.toUpperCase()) ?? [];
}
const dialogueCache = new Map<string, { stamp: string; value: Promise<Map<string, DialogueLine[]>> }>();
export async function readAllDialogue(file: string) {
  const info = await stat(file),
    stamp = `${info.size}:${info.mtimeMs}`,
    cached = dialogueCache.get(file);
  let value = cached?.stamp === stamp ? cached.value : undefined;
  if (!value) {
    value = readFile(file).then(parseAllDialogue);
    dialogueCache.set(file, { stamp, value });
    value.catch(() => {
      if (dialogueCache.get(file)?.value === value) dialogueCache.delete(file);
    });
  }
  return value;
}
export async function readDialogue(file: string, questFormId: string) {
  return (await readAllDialogue(file)).get(questFormId.toUpperCase()) ?? [];
}
type QuestIndex = { masters: string[]; localized: boolean; quests: Map<string, RecordEntry> };
const questIndexCache = new Map<string, { stamp: string; index: Promise<QuestIndex> }>();
async function questIndex(file: string, source: string): Promise<QuestIndex> {
  const info = await stat(file),
    stamp = `${info.size}:${info.mtimeMs}`;
  const cached = questIndexCache.get(file);
  if (cached?.stamp === stamp) return cached.index;
  const index = (async () => {
    const buffer = await readFile(file),
      entries = [...records(buffer, 0, buffer.length, undefined, new Set(['TES4', 'QUST']))],
      header = entries.find((r) => r.type === 'TES4');
    if (!header) throw new Error('Plugin header missing');
    const masters = [...fields(header.data)]
        .filter(([t]) => t === 'MAST')
        .map(([, v]) => string(v))
        .concat(source),
      quests = new Map<string, RecordEntry>();
    for (const q of entries) {
      if (q.type !== 'QUST') continue;
      const id = string(first([...fields(q.data)], 'EDID') ?? Buffer.alloc(0)).toLowerCase();
      if (id && !quests.has(id)) quests.set(id, q);
    }
    return { masters, localized: Boolean(buffer.readUInt32LE(8) & 0x80), quests };
  })();
  questIndexCache.set(file, { stamp, index });
  try {
    return await index;
  } catch (e) {
    if (questIndexCache.get(file)?.index === index) questIndexCache.delete(file);
    throw e;
  }
}
export async function resolveGameQuest(dataDir: string, plugin: string, id: string, target: PluginSnapshot) {
  if (
    !/^(skyrim|update|dawnguard|hearthfires|dragonborn)[.]esm$/i.test(plugin) ||
    !/^[a-z0-9_-]{1,100}$/i.test(id)
  )
    return null;
  for (const source of [
    ...new Set([plugin, ...(plugin.toLowerCase() === 'update.esm' ? ['Skyrim.esm'] : [])]),
  ]) {
    let indexData: QuestIndex;
    try {
      indexData = await questIndex(path.join(dataDir, source), source);
    } catch {
      continue;
    }
    const q = indexData.quests.get(id.toLowerCase());
    if (!q) continue;
    const owner = indexData.masters[q.id >>> 24],
      index = target.masters.findIndex((m) => m.toLowerCase() === owner?.toLowerCase());
    const questFields = [...fields(q.data)],
      stages = [
        ...new Set(
          questFields.filter(([t, v]) => t === 'INDX' && v.length >= 2).map(([, v]) => v.readUInt16LE()),
        ),
      ].sort((a, b) => a - b),
      localized = indexData.localized,
      strings = localized ? await gameStrings(dataDir, source) : new Map<number, string>(),
      objectiveTexts: Record<string, string> = {};
    let objective: number | undefined;
    for (const [kind, value] of questFields) {
      if (kind === 'QOBJ') objective = value.length >= 2 ? value.readUInt16LE() : undefined;
      else if (kind === 'NNAM' && objective !== undefined) {
        const text = localized
          ? value.length >= 4
            ? strings.get(value.readUInt32LE())
            : undefined
          : string(value);
        if (text) objectiveTexts[objective] = text;
        objective = undefined;
      }
    }
    return {
      id,
      plugin,
      stages,
      objectiveTexts,
      formId:
        index < 0
          ? null
          : (((index << 24) | (q.id & 0xffffff)) >>> 0).toString(16).padStart(8, '0').toUpperCase(),
    };
  }
  return null;
}
