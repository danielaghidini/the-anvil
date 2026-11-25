import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readPlugin, readSpeakerOptions } from '../backend/src/plugin.ts';
import { fields, parseAllDialogue, records, resolveGameQuest } from '../backend/src/quest-dialogue.ts';
import {
  buildStageDialogue,
  encodeLocationConditions,
  ensureEditorClosed,
  replacePlugin,
  sayOnceFlag,
  scan,
  sub,
  subrecords,
  type ScannedGroup,
} from '../backend/src/stage-dialogue.mjs';
import { stageMatchesDirectConditions } from '../shared/stage-match.ts';
import type { CatalogQuest } from '../shared/types.ts';

const [esp, manifest, ...flags] = process.argv.slice(2);
if (!esp || !manifest || flags.some((flag) => !['--apply', '--backfill-locations'].includes(flag))) {
  throw Error(
    'Usage: tsx scripts/stage-bjorn-dialogue.mts <ESP path> <TSV path> [--apply] [--backfill-locations]',
  );
}
const backfill = flags.includes('--backfill-locations');

const api = 'http://127.0.0.1:5173/api/projects/1';
async function get<T>(route: string): Promise<T> {
  const response = await fetch(api + route);
  if (!response.ok) throw Error(`${route}: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

const [original, snapshot, speakers, links, ignore, ignoredStages, catalog, source] = await Promise.all([
  readFile(esp),
  readPlugin(esp),
  readSpeakerOptions(esp),
  get<{
    groups: { questId: string; gameGroup: string }[];
    games: { questId: string; gameId: string; gamePlugin: string }[];
  }>('/quest-links'),
  get<{ quests: string[] }>('/ignored-skyrim-quests'),
  get<{ stages: { questKey: string; stage: number }[] }>('/ignored-stages'),
  readFile('data/skyrim-catalog.json', 'utf8').then((json) => JSON.parse(json) as { quests: CatalogQuest[] }),
  readFile(manifest, 'utf8'),
]);
if (snapshot.plugin.toLowerCase() !== 'dg04bjornfollower.esp') throw Error('Expected dg04bjornfollower.esp.');
const bjorn = speakers.find((npc) => npc.voiceType.toLowerCase() === 'dg04bjornvoice');
if (!bjorn || bjorn.formId !== '0500AA00') throw Error('Bjorn could not be located.');

const gameQuests = new Map(catalog.quests.map((q) => [q.id.toLowerCase(), q]));
const existing = parseAllDialogue(original);
const allExisting = [...existing.values()].flat();
const firstBatch = allExisting.filter((line) => {
  const formId = Number.parseInt(line.info, 16);
  return formId >= 0x05179870 && formId <= 0x05179950 && line.speaker === bjorn.formId;
});
const priorStages = new Map([
  ['MQ304', 200],
  ['MQ305', 200],
  ['DB02a', 20],
  ['DB04', 40],
]);
const locationIds = await readLocations(path.dirname(esp), snapshot.masters);
const locationUpdates = new Map<
  string,
  {
    gameFormId: string;
    priorStage: number;
    stage: number;
    locations: string[];
    outdoors: boolean;
  }
>();
const inserted: {
  owner: string;
  ownerFormId: string;
  quest: string;
  formId: string;
  stage: number;
  type: 'IDLE' | 'HELO';
  info: string;
  text: string;
}[] = [];
const seen = new Set<string>();
let modified: Buffer = original;

async function readLocations(dataDirectory: string, masters: string[]) {
  const index = new Map(masters.map((name, slot) => [name.toLowerCase(), slot]));
  const byEditorId = new Map<string, string>();
  const plugins = await Promise.all(masters.map((master) => readFile(path.join(dataDirectory, master))));
  for (const [slot, data] of plugins.entries()) {
    const entries = records(data, 0, data.length, undefined, new Set(['TES4', 'LCTN']));
    const header = entries.next().value;
    if (!header || header.type !== 'TES4') throw Error(`Invalid master: ${masters[slot]}`);
    const owners = [...fields(header.data)]
      .filter(([type]) => type === 'MAST')
      .map(([, value]) => value.toString('ascii').split('\0')[0]!.toLowerCase())
      .concat(masters[slot]!.toLowerCase());
    for (const location of entries) {
      const editorId = [...fields(location.data)]
        .find(([type]) => type === 'EDID')?.[1]
        .toString('ascii')
        .split('\0')[0]
        ?.toLowerCase();
      const owner = index.get(owners[location.id >>> 24] ?? '');
      if (editorId && owner !== undefined) {
        byEditorId.set(
          editorId,
          (((owner << 24) | (location.id & 0xffffff)) >>> 0).toString(16).padStart(8, '0'),
        );
      }
    }
  }
  return byEditorId;
}

function addConditionsToBatch(input: Buffer) {
  const groupGrowth = new Map<ScannedGroup, number>();
  const changes: { offset: number; next: number; bytes: Buffer }[] = [];
  const found = new Set<string>();
  for (const record of scan(input)) {
    if (record.type !== 'INFO' || !('id' in record)) continue;
    const id = record.id.toString(16).padStart(8, '0').toUpperCase();
    const plan = locationUpdates.get(id);
    if (!plan) continue;
    if (found.has(id) || !record.parent || record.flags & (0x20 | 0x40000)) {
      throw Error(`Unexpected layout for INFO ${id}.`);
    }
    found.add(id);
    const parts = subrecords(record.data);
    const flags = parts.find((part) => part.type === 'ENAM' && part.value.length === 4);
    const speaker = parts.find((part) => part.type === 'ANAM' && part.value.length === 4);
    const stage = parts.filter(
      ({ type, value }) =>
        type === 'CTDA' &&
        value.length === 32 &&
        value[0] === 0 &&
        value.readUInt16LE(8) === 58 &&
        value.readUInt32LE(12) === Number.parseInt(plan.gameFormId, 16) &&
        [plan.stage, plan.priorStage].includes(value.readFloatLE(4)),
    );
    if (!flags || !speaker || stage.length !== 1) throw Error(`Unexpected conditions for INFO ${id}.`);
    const expected = encodeLocationConditions(plan.locations, plan.outdoors);
    const locationFields = parts
      .filter(
        ({ type, value }) =>
          type === 'CTDA' &&
          value.length === 32 &&
          (value.readUInt16LE(8) === 359 || (plan.outdoors && value.readUInt16LE(8) === 300)),
      )
      .map(({ type, value }) => sub(type, value));
    if (locationFields.length && !Buffer.concat(locationFields).equals(Buffer.concat(expected))) {
      throw Error(`INFO ${id} already has different location conditions.`);
    }
    const info = Buffer.from(record.data);
    info.writeUInt16LE(flags.value.readUInt16LE() | sayOnceFlag, flags.offset + 6);
    info.writeUInt16LE(0, flags.offset + 8);
    info.writeFloatLE(plan.stage, stage[0]!.offset + 6 + 4);
    const payload = locationFields.length
      ? info
      : Buffer.concat([info.subarray(0, speaker.offset), ...expected, info.subarray(speaker.offset)]);
    if (payload.equals(record.data)) continue;
    const header = Buffer.from(input.subarray(record.offset, record.offset + 24));
    header.writeUInt32LE(payload.length, 4);
    changes.push({ offset: record.offset, next: record.next, bytes: Buffer.concat([header, payload]) });
    for (let parent: ScannedGroup | null = record.parent; parent; parent = parent.parent) {
      groupGrowth.set(parent, (groupGrowth.get(parent) ?? 0) + payload.length - record.data.length);
    }
  }
  if (found.size !== locationUpdates.size)
    throw Error('At least one batch INFO was not located in the plugin.');
  const source = Buffer.from(input);
  for (const [group, growth] of groupGrowth)
    source.writeUInt32LE(group.next - group.offset + growth, group.offset + 4);
  const chunks: Buffer[] = [];
  let offset = 0;
  for (const change of changes) {
    chunks.push(source.subarray(offset, change.offset), change.bytes);
    offset = change.next;
  }
  return Buffer.concat([...chunks, source.subarray(offset)]);
}

for (const row of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
  if (!row.trim() || row.startsWith('#')) continue;
  const [id, rawStage, idle, hello, explicitOwner, editors, terrain, ...extra] = row.split('\t');
  if (
    !id ||
    !rawStage ||
    !/^\d+$/.test(rawStage) ||
    !idle ||
    !hello ||
    !editors ||
    (terrain && terrain !== 'outdoors') ||
    extra.length
  ) {
    throw Error(`Invalid manifest row: ${row}`);
  }
  const locations = editors.split('|').map((editorId) => {
    const form = locationIds.get(editorId.toLowerCase());
    if (!form) throw Error(`Unresolved location for ${id}: ${editorId}.`);
    return form;
  });
  const outdoors = terrain === 'outdoors';
  const quest = gameQuests.get(id.toLowerCase());
  if (!quest) throw Error(`Base-game quest missing from catalog: ${id}`);
  const key = `${quest.plugin}|${quest.id}`.toLowerCase();
  const stage = Number(rawStage);
  if (
    ignore.quests.includes(key) ||
    ignoredStages.stages.some((s) => s.questKey === `game:${key}` && s.stage === stage)
  ) {
    throw Error(`Quest or stage is ignored in The Anvil: ${id} ${stage}`);
  }
  const vanilla = await resolveGameQuest(path.dirname(esp), quest.plugin, quest.id, snapshot);
  if (!vanilla?.formId || !vanilla.stages.includes(stage)) throw Error(`Unknown stage: ${id} ${stage}`);
  const formId = vanilla.formId;
  const master = snapshot.masters[Number.parseInt(formId.slice(0, 2), 16)];
  if (!/^(Skyrim|Update)\.esm$/i.test(master ?? '')) throw Error(`Quest belongs to an expansion: ${id}`);
  const destinations = new Set(links.groups.filter((l) => l.gameGroup === quest.group).map((l) => l.questId));
  for (const link of links.games) {
    if (`${link.gamePlugin}|${link.gameId}`.toLowerCase() === key) destinations.add(link.questId);
  }
  const ownerId = explicitOwner || (destinations.size === 1 ? [...destinations][0] : '');
  const owner = snapshot.quests.find((q) => q.id === ownerId && destinations.has(q.id));
  if (!owner) throw Error(`Select a linked destination for ${id}.`);

  for (const [type, text] of [
    ['IDLE', idle],
    ['HELO', hello],
  ] as const) {
    if (text === '-') continue;
    const slot = `${formId}|${stage}|${type}`;
    if (seen.has(slot)) throw Error(`Duplicate slot in manifest: ${id} ${stage} ${type}`);
    seen.add(slot);
    if (backfill) {
      const priorStage = priorStages.get(id) ?? stage;
      const candidates = firstBatch.filter(
        (line) =>
          line.topicType === type &&
          (stageMatchesDirectConditions(priorStage, formId, line.conditions) ||
            stageMatchesDirectConditions(stage, formId, line.conditions)),
      );
      if (candidates.length > 1) throw Error(`Ambiguous batch dialogue: ${id} ${stage} ${type}.`);
      if (candidates[0]) {
        locationUpdates.set(candidates[0].info, {
          gameFormId: formId,
          priorStage,
          stage,
          locations,
          outdoors,
        });
      }
      continue;
    }
    const sameSlot = allExisting.filter(
      (line) =>
        line.topicType === type &&
        (!line.speaker || line.speaker === bjorn.formId) &&
        stageMatchesDirectConditions(stage, formId, line.conditions),
    );
    if (sameSlot.length) {
      console.log(`Already covered: ${id} ${stage} ${type}`);
      continue;
    }
    const result = buildStageDialogue(modified, {
      ownerFormId: owner.formId,
      speakerFormId: bjorn.formId,
      gameFormId: formId,
      stage,
      text,
      type,
      pendingVoice: true,
      locations,
      outdoors,
      conditions: [{ function: 'GetCombatState', operator: 'eq', runOn: 'subject', value: 0 }],
    });
    modified = result.modified;
    inserted.push({
      owner: owner.id,
      ownerFormId: owner.formId,
      quest: id,
      formId,
      stage,
      type,
      info: result.info.toUpperCase(),
      text,
    });
  }
}
if (backfill) {
  if (firstBatch.length !== 225 || locationUpdates.size !== 225) {
    throw Error(
      `Expected 225 original draft INFOs, matched ${locationUpdates.size} of ${firstBatch.length}.`,
    );
  }
  modified = addConditionsToBatch(original);
}
const finalDialogue = parseAllDialogue(modified);
for (const [owner, lines] of existing) {
  const current = new Map(finalDialogue.get(owner)?.map((line) => [`${line.info}|${line.response}`, line]));
  for (const line of lines) {
    if (
      !locationUpdates.has(line.info) &&
      JSON.stringify(current.get(`${line.info}|${line.response}`)) !== JSON.stringify(line)
    )
      throw Error(`Existing dialogue changed: ${line.info}.`);
  }
}
for (const row of inserted) {
  const line = finalDialogue.get(row.ownerFormId)?.find((item) => item.info === row.info);
  if (
    !line?.pendingVoice ||
    line.text !== row.text ||
    line.speaker !== bjorn.formId ||
    line.topicType !== row.type ||
    !stageMatchesDirectConditions(row.stage, row.formId, line.conditions)
  ) {
    throw Error(`Draft did not round-trip: ${row.info}.`);
  }
}
if (backfill) {
  for (const line of [...finalDialogue.values()].flat()) {
    const plan = locationUpdates.get(line.info);
    if (!plan) continue;
    const previous = firstBatch.find((item) => item.info === line.info);
    if (
      !previous ||
      previous.text !== line.text ||
      previous.pendingVoice !== line.pendingVoice ||
      previous.speaker !== line.speaker ||
      previous.topicType !== line.topicType ||
      previous.response !== line.response ||
      !stageMatchesDirectConditions(plan.stage, plan.gameFormId, line.conditions)
    ) {
      throw Error(`Migrated dialogue did not round-trip: ${line.info}.`);
    }
  }
  if (!modified.equals(addConditionsToBatch(modified))) throw Error('Location update did not round-trip.');
  console.log(`${locationUpdates.size} existing INFOs with Say Once and location conditions verified.`);
}
if (flags.includes('--apply') && !modified.equals(original)) {
  ensureEditorClosed();
  console.log(`Backup: ${replacePlugin(esp, path.resolve('data/plugin-backups'), original, modified)}`);
}
if (backfill) process.exit(0);
console.table(inserted.map(({ quest, stage, type, info, text }) => ({ quest, stage, type, info, text })));
console.log(
  `${inserted.length} draft(s) across ${new Set(inserted.map((line) => line.quest)).size} Skyrim quests.`,
);
