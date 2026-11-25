import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createQuest } from '../backend/src/quest-create.mjs';
import { readPlugin } from '../backend/src/plugin.js';

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
function plugin(groups: Buffer[], records: number) {
  const hedr = Buffer.alloc(12);
  hedr.writeUInt32LE(records, 4);
  hedr.writeUInt32LE(0x900, 8);
  const header = record(
    'TES4',
    0,
    Buffer.concat([
      sub('HEDR', hedr),
      sub('MAST', Buffer.from('Skyrim.esm\0')),
      sub('DATA', Buffer.alloc(8)),
    ]),
  );
  return Buffer.concat([header, ...groups]);
}
const closed = () => {};
function withPlugin(original: Buffer, run: (file: string, dir: string) => Promise<void> | void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'quest-create-'));
  const file = path.join(dir, 'test.esp');
  writeFileSync(file, original);
  return Promise.resolve(run(file, dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}
const hedrOf = (b: Buffer) => b.subarray(24 + 6, 24 + 18);

test('appends a quest to the existing QUST group and updates the header', () =>
  withPlugin(
    plugin(
      [
        group(
          'QUST',
          record('QUST', 0x01000800, Buffer.concat([edid('OldQuest'), sub('ANAM', Buffer.alloc(4))])),
        ),
      ],
      2,
    ),
    async (file, dir) => {
      const result = createQuest(
        file,
        path.join(dir, 'backups'),
        { editorId: 'NewQuest', name: 'A New Quest', priority: 60, type: 6, startGameEnabled: true },
        closed,
      );
      assert.equal(result.formId, '01000900');
      const written = readFileSync(file);
      assert.equal(hedrOf(written).readUInt32LE(4), 3);
      assert.equal(hedrOf(written).readUInt32LE(8), 0x901);
      const snapshot = await readPlugin(file, dir);
      assert.deepEqual(
        snapshot.quests.map((q) => [q.id, q.name, q.formId]),
        [
          ['OldQuest', undefined, '01000800'],
          ['NewQuest', 'A New Quest', '01000900'],
        ],
      );
      const dnam = written.subarray(written.indexOf('DNAM') + 6, written.indexOf('DNAM') + 18);
      assert.equal(dnam.readUInt16LE(0), 0x11);
      assert.equal(dnam[2], 60);
      assert.equal(dnam.readUInt32LE(8), 6);
      assert.ok(readFileSync(result.backup).length < written.length);
    },
  ));

test('creates a QUST group in record order when the plugin has none', () =>
  withPlugin(
    plugin(
      [
        group('NPC_', record('NPC_', 0x01000800, edid('SomeNpc'))),
        group('PACK', record('PACK', 0x01000801, edid('SomePackage'))),
      ],
      4,
    ),
    async (file, dir) => {
      createQuest(file, path.join(dir, 'backups'), { editorId: 'FirstQuest' }, closed);
      const written = readFileSync(file);
      assert.equal(hedrOf(written).readUInt32LE(4), 6);
      const npc = written.indexOf('NPC_SomeNpc'.slice(0, 4)),
        quest = written.indexOf('GRUP', written.indexOf('SomeNpc')),
        pack = written.indexOf('PACK', quest + 8);
      assert.ok(npc < quest && quest < pack);
      assert.equal(written.toString('ascii', quest + 8, quest + 12), 'QUST');
      const snapshot = await readPlugin(file, dir);
      assert.deepEqual(
        snapshot.quests.map((q) => q.id),
        ['FirstQuest'],
      );
    },
  ));

test('refuses duplicate or invalid Editor IDs without modifying the plugin', () => {
  const original = plugin([group('QUST', record('QUST', 0x01000800, edid('OldQuest')))], 2);
  return withPlugin(original, (file, dir) => {
    for (const editorId of ['oldquest', '1Bad', 'Has Space', ''])
      assert.throws(() => createQuest(file, path.join(dir, 'backups'), { editorId }, closed));
    assert.throws(() =>
      createQuest(file, path.join(dir, 'backups'), { editorId: 'Fine', priority: 101 }, closed),
    );
    assert.deepEqual(readFileSync(file), original);
  });
});
