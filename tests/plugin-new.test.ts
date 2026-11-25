import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createEmptyPlugin, masterAvailability, normalizePluginFileName } from '../backend/src/plugin-new.js';
import { readPlugin } from '../backend/src/plugin.js';
import { createQuest } from '../backend/src/quest-create.mjs';

function withData(masters: string[], run: (dir: string) => Promise<void> | void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'plugin-new-'));
  for (const m of masters) writeFileSync(path.join(dir, m), Buffer.alloc(0));
  return Promise.resolve(run(dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}
const fieldsOf = (b: Buffer) => {
  const out: [string, Buffer][] = [];
  for (let p = 24; p < 24 + b.readUInt32LE(4);) {
    const size = b.readUInt16LE(p + 4);
    out.push([b.toString('ascii', p, p + 4), b.subarray(p + 6, p + 6 + size)]);
    p += 6 + size;
  }
  return out;
};

test('creates a minimal SSE plugin header with the chosen masters in load order', () =>
  withData(['Skyrim.esm', 'Update.esm', 'Dawnguard.esm'], async (dir) => {
    const result = createEmptyPlugin(dir, {
      fileName: 'Bjorn',
      author: 'Me',
      masters: ['Dawnguard.esm', 'Update.esm'],
    });
    assert.equal(result.fileName, 'Bjorn.esp');
    const b = readFileSync(result.file);
    assert.equal(b.toString('ascii', 0, 4), 'TES4');
    assert.equal(b.readUInt32LE(8), 0, 'no header flags');
    assert.equal(b.readUInt16LE(20), 44);
    assert.equal(b.length, 24 + b.readUInt32LE(4));
    const f = fieldsOf(b);
    const hedr = f.find(([t]) => t === 'HEDR')![1];
    assert.ok(Math.abs(hedr.readFloatLE(0) - 1.71) < 1e-6);
    assert.equal(hedr.readUInt32LE(4), 0);
    assert.equal(hedr.readUInt32LE(8), 0x800);
    assert.equal(f.find(([t]) => t === 'CNAM')![1].toString('latin1'), 'Me\0');
    assert.deepEqual(
      f.filter(([t]) => t === 'MAST').map(([, v]) => v.toString('latin1').replace(/\0$/, '')),
      ['Skyrim.esm', 'Update.esm', 'Dawnguard.esm'],
    );
    assert.equal(f.filter(([t]) => t === 'DATA').length, 3);
    const snapshot = await readPlugin(result.file, dir);
    assert.deepEqual(snapshot.masters, ['Skyrim.esm', 'Update.esm', 'Dawnguard.esm']);
    assert.deepEqual(snapshot.quests, []);
  }));

test('a new plugin accepts quests created by the panel', () =>
  withData(['Skyrim.esm'], async (dir) => {
    const { file } = createEmptyPlugin(dir, { fileName: 'Empty.esp' });
    const backups = path.join(dir, 'backups');
    const quest = createQuest(file, backups, { editorId: 'BjornIntro', name: 'Meet Bjorn' }, () => {});
    assert.equal(quest.formId, '01000800');
    const snapshot = await readPlugin(file, dir);
    assert.deepEqual(
      snapshot.quests.map((q) => [q.id, q.formId, q.name]),
      [['BjornIntro', '01000800', 'Meet Bjorn']],
    );
  }));

test('refuses to overwrite an existing plugin', () =>
  withData(['Skyrim.esm', 'Mine.esp'], (dir) => {
    assert.throws(() => createEmptyPlugin(dir, { fileName: 'mine' }), { statusCode: 409 });
    assert.equal(readFileSync(path.join(dir, 'Mine.esp')).length, 0);
  }));

test('reports masters missing from the Data folder', () =>
  withData(['Skyrim.esm'], (dir) => {
    assert.throws(() => createEmptyPlugin(dir, { fileName: 'A', masters: ['Dragonborn.esm'] }), {
      statusCode: 422,
      message: /Dragonborn\.esm/,
    });
    assert.deepEqual(
      masterAvailability(dir).map((m) => [m.name, m.available]),
      [
        ['Skyrim.esm', true],
        ['Update.esm', false],
        ['Dawnguard.esm', false],
        ['HearthFires.esm', false],
        ['Dragonborn.esm', false],
      ],
    );
  }));

test('validates file names and inputs', () => {
  assert.equal(normalizePluginFileName(' My Follower '), 'My Follower.esp');
  assert.equal(normalizePluginFileName('x.ESP'), 'x.esp');
  for (const bad of ['', '../evil', 'a\\b', 'C:x', 'a/b', '.hidden', 'name.', 'skyrim', 'Update.esp'])
    assert.throws(() => normalizePluginFileName(bad), { statusCode: 400 }, bad);
  return withData(['Skyrim.esm'], (dir) => {
    assert.throws(() => createEmptyPlugin(dir, { fileName: 'A', masters: ['Other.esm'] }), {
      statusCode: 400,
    });
    assert.throws(() => createEmptyPlugin(dir, { fileName: 'A', author: 'Jörn' }), { statusCode: 400 });
  });
});

test('fails clearly when the Data folder does not exist', () => {
  assert.throws(() => createEmptyPlugin(path.join(tmpdir(), 'no-such-skyrim-dir-xyz'), { fileName: 'A' }), {
    statusCode: 422,
  });
});
