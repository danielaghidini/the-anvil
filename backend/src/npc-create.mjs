import { addTopLevelRecord, validEditorId, validName } from './quest-create.mjs';
import { ensureEditorClosed, fail, sub } from './stage-dialogue.mjs';

// Skyrim.esm defaults for a blank actor; everything else is meant to be set in the Creation Kit.
const NORD_RACE = 0x013746,
  CITIZEN_CLASS = 0x01326b,
  MALE_EVEN_TONED = 0x013ad2;

const u32 = (value) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(value >>> 0);
  return b;
};
const f32 = (value) => {
  const b = Buffer.alloc(4);
  b.writeFloatLE(value);
  return b;
};

export function buildNpcPayload(editorId, name, skyrimIndex) {
  const vanilla = (id) => u32(((skyrimIndex << 24) | id) >>> 0);
  const obnd = Buffer.from('eafff2ff000016000e008000', 'hex'); // standard humanoid bounds
  const acbs = Buffer.alloc(24);
  acbs.writeUInt16LE(1, 8); // level
  acbs.writeUInt16LE(1, 10); // calc min level
  acbs.writeUInt16LE(100, 14); // speed multiplier
  acbs.writeInt16LE(35, 16); // base disposition
  const aidt = Buffer.alloc(20);
  aidt.writeUInt8(2, 1); // confidence: average
  aidt.writeUInt8(50, 2); // energy
  const dnam = Buffer.alloc(52);
  dnam.fill(15, 0, 18); // skill values
  dnam.writeUInt16LE(50, 36); // health
  dnam.writeUInt16LE(50, 38); // magicka
  dnam.writeUInt16LE(50, 40); // stamina
  dnam.writeUInt16LE(0xffff, 42);
  dnam.writeUInt8(1, 48); // geared up weapons
  return Buffer.concat([
    sub('EDID', Buffer.from(editorId + '\0', 'ascii')),
    sub('OBND', obnd),
    sub('ACBS', acbs),
    sub('VTCK', vanilla(MALE_EVEN_TONED)),
    sub('RNAM', vanilla(NORD_RACE)),
    sub('AIDT', aidt),
    sub('CNAM', vanilla(CITIZEN_CLASS)),
    ...(name ? [sub('FULL', Buffer.from(name + '\0', 'ascii'))] : []),
    sub('DATA', Buffer.alloc(0)),
    sub('DNAM', dnam),
    sub('NAM6', f32(1)), // height
    sub('NAM7', f32(50)), // weight
    sub('NAM8', u32(1)), // sound level: normal
  ]);
}

export function createNpc(file, backupDirectory, input, assertEditorClosed = ensureEditorClosed) {
  const editorId = validEditorId(input),
    name = validName(input, 'NPC');
  return addTopLevelRecord(
    file,
    backupDirectory,
    'NPC_',
    editorId,
    (masters) => {
      const skyrimIndex = masters.findIndex((m) => m.toLowerCase() === 'skyrim.esm');
      if (skyrimIndex < 0) fail(422, 'The plugin needs Skyrim.esm as a master to create an NPC.');
      return buildNpcPayload(editorId, name, skyrimIndex);
    },
    assertEditorClosed,
  );
}
