import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createNpc } from '../backend/src/npc-create.mjs';
import { readPluginNpcs } from '../backend/src/plugin.js';

const sub = (name: string, data: Buffer) => {
  const h = Buffer.alloc(6);
  h.write(name);
  h.writeUInt16LE(data.length, 4);
  return Buffer.concat([h, data]);
};
const record = (name: string, id: number, data: Buffer) => {
  const h = Buffer.alloc(24);
  h.write(name);
  h.writeUInt32LE(data.length, 4);
  h.writeUInt32LE(id, 12);
  h.writeUInt16LE(44, 20);
  return Buffer.concat([h, data]);
};
const group = (label: string, items: Buffer) => {
  const h = Buffer.alloc(24);
  h.write('GRUP');
  h.writeUInt32LE(items.length + 24, 4);
  h.write(label, 8);
  return Buffer.concat([h, items]);
};
const edid = (value: string) => sub('EDID', Buffer.from(value + '\0'));
function plugin(groups: Buffer[], records: number, masters = ['Skyrim.esm']) {
  const hedr = Buffer.alloc(12);
  hedr.writeUInt32LE(records, 4);
  hedr.writeUInt32LE(0x900, 8);
  const header = record(
    'TES4',
    0,
    Buffer.concat([
      sub('HEDR', hedr),
      ...masters.flatMap((m) => [sub('MAST', Buffer.from(m + '\0')), sub('DATA', Buffer.alloc(8))]),
    ]),
  );
  return Buffer.concat([header, ...groups]);
}
const closed = () => {};
function withPlugin(original: Buffer, run: (file: string, dir: string) => Promise<void> | void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'npc-create-'));
  const file = path.join(dir, 'test.esp');
  writeFileSync(file, original);
  return Promise.resolve(run(file, dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}
const hedrOf = (b: Buffer) => b.subarray(24 + 6, 24 + 18);
function fieldsOf(data: Buffer) {
  const out = new Map<string, Buffer>();
  for (let i = 0; i < data.length;) {
    const n = data.readUInt16LE(i + 4);
    out.set(data.toString('ascii', i, i + 4), data.subarray(i + 6, i + 6 + n));
    i += 6 + n;
  }
  return out;
}

test('creates an NPC_ group in record order with a blank Nord pointing at Skyrim.esm', () =>
  withPlugin(
    plugin(
      [
        group('ARMO', record('ARMO', 0x02000800, edid('SomeArmor'))),
        group('QUST', record('QUST', 0x02000801, edid('SomeQuest'))),
      ],
      4,
      ['Dummy.esm', 'Skyrim.esm'],
    ),
    async (file, dir) => {
      const result = createNpc(file, path.join(dir, 'backups'), { editorId: 'MyNpc', name: 'Bjorn' }, closed);
      assert.equal(result.formId, '02000900');
      const written = readFileSync(file);
      assert.equal(hedrOf(written).readUInt32LE(4), 6);
      assert.equal(hedrOf(written).readUInt32LE(8), 0x901);
      const armo = written.indexOf('SomeArmor'),
        npcGroup = written.indexOf('GRUP', armo),
        quest = written.indexOf('SomeQuest');
      assert.equal(written.toString('ascii', npcGroup + 8, npcGroup + 12), 'NPC_');
      assert.ok(armo < npcGroup && npcGroup < quest);
      const rec = npcGroup + 24;
      assert.equal(written.toString('ascii', rec, rec + 4), 'NPC_');
      const f = fieldsOf(written.subarray(rec + 24, rec + 24 + written.readUInt32LE(rec + 4)));
      assert.equal(f.get('RNAM')!.readUInt32LE(), 0x01013746);
      assert.equal(f.get('CNAM')!.readUInt32LE(), 0x0101326b);
      assert.equal(f.get('VTCK')!.readUInt32LE(), 0x01013ad2);
      assert.equal(f.get('ACBS')!.length, 24);
      assert.equal(f.get('DNAM')!.length, 52);
      assert.deepEqual(
        (await readPluginNpcs(file)).map((n) => [n.formId, n.editorId, n.name]),
        [['02000900', 'MyNpc', 'Bjorn']],
      );
    },
  ));

test('appends to an existing NPC_ group', () =>
  withPlugin(plugin([group('NPC_', record('NPC_', 0x01000800, edid('OldNpc')))], 2), async (file, dir) => {
    createNpc(file, path.join(dir, 'backups'), { editorId: 'NewNpc' }, closed);
    const written = readFileSync(file);
    assert.equal(hedrOf(written).readUInt32LE(4), 3);
    assert.deepEqual(
      (await readPluginNpcs(file)).map((n) => n.editorId),
      ['NewNpc', 'OldNpc'],
    );
  }));

test('refuses duplicates, bad IDs, and plugins without Skyrim.esm without modifying them', async () => {
  const original = plugin([group('NPC_', record('NPC_', 0x01000800, edid('OldNpc')))], 2);
  await withPlugin(original, (file, dir) => {
    for (const editorId of ['oldnpc', '1Bad', 'Has Space', ''])
      assert.throws(() => createNpc(file, path.join(dir, 'backups'), { editorId }, closed));
    assert.deepEqual(readFileSync(file), original);
  });
  const noSkyrim = plugin([], 1, ['Other.esm']);
  await withPlugin(noSkyrim, (file, dir) => {
    assert.throws(
      () => createNpc(file, path.join(dir, 'backups'), { editorId: 'NewNpc' }, closed),
      /Skyrim\.esm/,
    );
    assert.deepEqual(readFileSync(file), noSkyrim);
  });
});
