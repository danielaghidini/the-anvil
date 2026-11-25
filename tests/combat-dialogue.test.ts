import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { combatEventLabel, isCombatDialogue } from '../shared/combat-dialogue.js';
import { categoryLines, dialogueCategory, dialogueForQuest } from '../shared/dialogue-categories.js';
import { fields, parseAllDialogue, records } from '../backend/src/quest-dialogue.js';
import { editDialogue } from '../backend/src/dialogue-edit.mjs';

function sub(type: string, value: Buffer) {
  const header = Buffer.alloc(6);
  header.write(type);
  header.writeUInt16LE(value.length, 4);
  return Buffer.concat([header, value]);
}
function u32(value: number) {
  const data = Buffer.alloc(4);
  data.writeUInt32LE(value);
  return data;
}
function record(type: string, id: number, data: Buffer, compressed = false) {
  const header = Buffer.alloc(24);
  header.write(type);
  header.writeUInt32LE(id, 12);
  if (compressed) {
    header.writeUInt32LE(0x40000, 8);
    data = Buffer.concat([u32(data.length), deflateSync(data)]);
  }
  header.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, data]);
}
function group(label: number, type: number, data: Buffer) {
  const header = Buffer.alloc(24);
  header.write('GRUP');
  header.writeUInt32LE(data.length + 24, 4);
  header.writeUInt32LE(label, 8);
  header.writeUInt32LE(type, 12);
  return Buffer.concat([header, data]);
}
function fixture(compressed = false) {
  const hedr = Buffer.alloc(12);
  hedr.writeUInt32LE(9, 4);
  const response = Buffer.alloc(24);
  response[12] = 1;
  const condition = Buffer.alloc(32);
  condition.writeUInt16LE(72, 8);
  condition.writeUInt32LE(0x01000815, 12);
  function topic(index: number, type: string, category: number, text: string) {
    const id = 0x01000800 + index;
    return Buffer.concat([
      record(
        'DIAL',
        id,
        Buffer.concat([
          sub('QNAM', u32(0x01000700)),
          sub('SNAM', Buffer.from(type)),
          sub('DATA', Buffer.from([0, category, 0, 0])),
        ]),
      ),
      group(
        id,
        7,
        record(
          'INFO',
          id + 0x100,
          Buffer.concat([
            sub('CTDA', condition),
            sub('VMAD', Buffer.from('script metadata')),
            sub('TRDT', response),
            sub('NAM1', Buffer.from(text + '\0')),
            sub('ANAM', u32(0x01000815)),
          ]),
          compressed,
        ),
      ),
    ]);
  }
  return Buffer.concat([
    record('TES4', 0, Buffer.concat([sub('HEDR', hedr), sub('MAST', Buffer.from('Skyrim.esm\0'))])),
    group(
      0,
      0,
      Buffer.concat([
        topic(1, 'ATCK', 3, 'Have at you!'),
        topic(2, 'NOTC', 5, 'There you are!'),
        topic(3, 'GRNT', 7, ''),
        topic(4, 'HELO', 7, 'Hello.'),
      ]),
    ),
  ]);
}

test('combat browsing includes detection, grunts without subtitles and quests without stages', () => {
  const all = parseAllDialogue(fixture(true));
  const lines = categoryLines(all.get('01000700')!, 'combat');
  assert.deepEqual(
    lines.map((line) => line.topicType),
    ['ATCK', 'NOTC', 'GRNT'],
  );
  assert.equal(lines[2].text, '');
  assert.equal(lines[0].topicCategory, 3);
  assert.deepEqual(
    categoryLines(all.get('01000700')!, 'hello').map((line) => line.text),
    ['Hello.'],
  );
  assert.equal(isCombatDialogue({ topicType: 'NEW_', topicCategory: 3 }), true);
  assert.equal(isCombatDialogue({ topicType: 'HELO', topicCategory: 7 }), false);
  assert.equal(combatEventLabel('POAT'), 'Power attack');
});

for (const compressed of [false, true])
  test(`editing combat preserves conditions, scripts and topic data (compressed: ${compressed})`, () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'anvil-combat-'));
    try {
      const file = path.join(directory, 'combat.esp'),
        original = fixture(compressed);
      writeFileSync(file, original);
      const result = editDialogue(
        file,
        path.join(directory, 'backups'),
        {
          questFormId: '01000700',
          info: '01000901',
          response: 1,
          expectedText: 'Have at you!',
          text: 'You picked the wrong fight!',
        },
        () => {},
      );
      assert.deepEqual(readFileSync(result.backup!), original);
      const before = [...records(original)],
        after = [...records(readFileSync(file))];
      assert.equal(before.length, after.length);
      for (let i = 0; i < before.length; i++) {
        if (before[i].id !== 0x01000901) assert.deepEqual(after[i].data, before[i].data);
        else
          assert.deepEqual(
            [...fields(after[i].data)].filter(([type]) => type !== 'NAM1'),
            [...fields(before[i].data)].filter(([type]) => type !== 'NAM1'),
          );
      }
      assert.equal(
        parseAllDialogue(readFileSync(file)).get('01000700')![0].text,
        'You picked the wrong fight!',
      );
      editDialogue(
        file,
        path.join(directory, 'backups'),
        {
          questFormId: '01000700',
          info: '01000903',
          response: 1,
          expectedText: '',
          text: 'Argh!',
        },
        () => {},
      );
      assert.equal(parseAllDialogue(readFileSync(file)).get('01000700')![2].text, 'Argh!');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

test('quest categories partition every response without classifying ordinary idle or hello as combat', () => {
  const types = ['HELO', 'IDLE', 'CUST', 'ATCK', 'NOTC', 'SCEN', 'GBYE'];
  assert.deepEqual(
    types.map((topicType) => dialogueCategory({ topicType })),
    ['hello', 'idle', 'dialogue', 'combat', 'combat', 'scene', 'other'],
  );
  assert.equal(dialogueCategory({ topicType: 'NEW_', topicCategory: 3 }), 'combat');
});

test('Skyrim quest categories exclude unrelated combat from linked follower quests', () => {
  const lines = [
    { topicType: 'NOTC', conditions: [] },
    { topicType: 'IDLE', conditions: [{ questFormId: '0001ABCD' }] },
    { topicType: 'TAUT', conditions: [{ questFormId: '0001DCBA' }] },
  ];
  assert.deepEqual(dialogueForQuest(lines, '0001abcd'), [lines[1]]);
  assert.deepEqual(dialogueForQuest(lines, null), []);
});
