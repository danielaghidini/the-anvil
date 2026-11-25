import { readFileSync } from 'node:fs';
import { ensureEditorClosed, fail, replacePlugin, scan, sub, subrecords } from './stage-dialogue.mjs';

const topGroupOrder =
  'GMST KYWD LCRT AACT TXST GLOB CLAS FACT HDPT HAIR EYES RACE SOUN ASPC MGEF SCPT LTEX ENCH SPEL SCRL ACTI TACT ARMO BOOK CONT DOOR INGR LIGH MISC APPA STAT SCOL MSTT PWAT GRAS TREE CLDC FLOR FURN WEAP AMMO NPC_ LVLN KEYM ALCH IDLM COBJ PROJ HAZD SLGM LVLI WTHR CLMT SPGD RFCT REGN NAVI CELL WRLD DIAL QUST IDLE PACK CSTY LSCR LVSP ANIO WATR EFSH EXPL DEBR IMGS IMAD FLST PERK BPTD ADDN AVIF CAMS CPTH VTYP MATT IPCT IPDS ARMA ECZN LCTN MESG RGDL DOBJ LGTM MUSC FSTP FSTS SMBN SMQN SMEN DLBR MUST DLVW WOOP SHOU EQUP RELA SCEN ASTP OTFT ARTO MATO MOVT SNDR DUAL SNCT SOPM COLL CLFM REVB LENS VOLI'.split(
    ' ',
  );
const label = (name) => Buffer.from(name, 'ascii').readUInt32LE(0);
const START_GAME_ENABLED = 0x0001,
  STARTS_ENABLED = 0x0010,
  RUN_ONCE = 0x0100;

export function validEditorId(input) {
  const editorId = typeof input.editorId === 'string' ? input.editorId.trim() : '';
  if (!/^[A-Za-z][A-Za-z0-9_]{1,98}$/.test(editorId))
    fail(400, 'The Editor ID must start with a letter and use 2–99 letters, digits, or underscores.');
  return editorId;
}

export function validName(input, what) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length > 100 || (name && !/^[\x20-\x7e]+$/.test(name)))
    fail(400, `Enter up to 100 ASCII characters for the ${what} name.`);
  return name;
}

// Adds one new top-level record (e.g. QUST, NPC_) to a plugin, creating its group if needed.
// `build` receives the plugin's master list and returns the record's subrecord payload.
export function addTopLevelRecord(file, backupDirectory, type, editorId, build, assertEditorClosed) {
  assertEditorClosed();
  const original = readFileSync(file),
    all = scan(original);
  const header = all.find((r) => r.type === 'TES4');
  if (!header || header.offset !== 0 || header.flags & (0x40000 | 0x200 | 0x80))
    fail(422, 'Unsupported plugin layout.');
  const headFields = subrecords(header.data),
    masterNames = headFields
      .filter((s) => s.type === 'MAST')
      .map((s) => s.value.toString('latin1').replace(/\0.*$/s, '')),
    masters = masterNames.length,
    hedr = headFields.find((s) => s.type === 'HEDR');
  if (!hedr || hedr.value.length !== 12 || masters > 253) fail(422, 'Unsupported plugin metadata.');
  const records = all.filter((r) => r.type !== 'GRUP');
  const taken = records.some(
    (r) =>
      subrecords(r.data)
        .find((s) => s.type === 'EDID')
        ?.value.toString('latin1')
        .replace(/\0.*$/s, '')
        .toLowerCase() === editorId.toLowerCase(),
  );
  if (taken) fail(409, `This plugin already has a record named ${editorId}.`);

  const used = new Set(records.map((r) => r.id));
  let local = hedr.value.readUInt32LE(8);
  if (local < 0x800) local = 0x800;
  let newId = ((masters << 24) | local) >>> 0;
  while (local <= 0xffffff && used.has(newId)) {
    local++;
    newId = ((masters << 24) | local) >>> 0;
  }
  if (local >= 0xffffff) fail(422, 'No free Form IDs available.');

  const payload = build(masterNames);
  const sample = records.find((r) => r.type === type) ?? records.find((r) => r.type !== 'TES4');
  const rh = Buffer.alloc(24);
  rh.write(type);
  rh.writeUInt32LE(payload.length, 4);
  rh.writeUInt32LE(newId, 12);
  // Reuse the form version / VC info the Creation Kit wrote on an existing record.
  if (sample) original.copy(rh, 16, sample.offset + 16, sample.offset + 24);
  else rh.writeUInt16LE(44, 20);
  const record = Buffer.concat([rh, payload]);

  const topGroups = all.filter((r) => r.type === 'GRUP' && !r.parent && r.groupType === 0);
  const group = topGroups.find((g) => g.label === label(type));
  let modified,
    added = 1;
  if (group) {
    modified = Buffer.concat([original.subarray(0, group.next), record, original.subarray(group.next)]);
    modified.writeUInt32LE(original.readUInt32LE(group.offset + 4) + record.length, group.offset + 4);
  } else {
    const rank = (g) => topGroupOrder.indexOf(original.toString('ascii', g.offset + 8, g.offset + 12));
    const after = topGroups.find((g) => rank(g) > topGroupOrder.indexOf(type));
    const at = after ? after.offset : original.length;
    const gh = Buffer.alloc(24);
    gh.write('GRUP');
    gh.writeUInt32LE(24 + record.length, 4);
    gh.write(type, 8, 'ascii');
    if (topGroups[0]) original.copy(gh, 16, topGroups[0].offset + 16, topGroups[0].offset + 24);
    modified = Buffer.concat([original.subarray(0, at), gh, record, original.subarray(at)]);
    added = 2;
  }
  const hedrAt = header.offset + 24 + hedr.offset + 6;
  modified.writeUInt32LE(hedr.value.readUInt32LE(4) + added, hedrAt + 4);
  modified.writeUInt32LE(local + 1, hedrAt + 8);
  const backup = replacePlugin(file, backupDirectory, original, modified);
  return { formId: newId.toString(16).padStart(8, '0').toUpperCase(), editorId, backup };
}

export function createQuest(file, backupDirectory, input, assertEditorClosed = ensureEditorClosed) {
  const editorId = validEditorId(input),
    name = validName(input, 'quest');
  const priority = input.priority ?? 50,
    type = input.type ?? 0;
  if (!Number.isInteger(priority) || priority < 0 || priority > 100)
    fail(400, 'The priority must be a whole number from 0 to 100.');
  if (!Number.isInteger(type) || type < 0 || type > 11) fail(400, 'Invalid quest type.');

  return addTopLevelRecord(
    file,
    backupDirectory,
    'QUST',
    editorId,
    () => {
      const dnam = Buffer.alloc(12);
      dnam.writeUInt16LE(
        (input.startGameEnabled ? START_GAME_ENABLED | STARTS_ENABLED : 0) | (input.runOnce ? RUN_ONCE : 0),
        0,
      );
      dnam.writeUInt8(priority, 2);
      dnam.writeUInt8(0xff, 3);
      dnam.writeUInt32LE(type, 8);
      return Buffer.concat([
        sub('EDID', Buffer.from(editorId + '\0', 'ascii')),
        ...(name ? [sub('FULL', Buffer.from(name + '\0', 'ascii'))] : []),
        sub('DNAM', dnam),
        sub('NEXT', Buffer.alloc(0)),
        sub('ANAM', Buffer.alloc(4)),
      ]);
    },
    assertEditorClosed,
  );
}
