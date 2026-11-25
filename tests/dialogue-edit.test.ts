import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { deflateSync } from 'node:zlib';
import { deleteDialogue, editDialogue, editDialogueTiming } from '../backend/src/dialogue-edit.mjs';
import { createStageDialogue } from '../backend/src/stage-dialogue.mjs';
import { fields, parseDialogue, records } from '../backend/src/quest-dialogue.js';
const sub = (kind: string, value: Buffer) => {
  const h = Buffer.alloc(6);
  h.write(kind);
  h.writeUInt16LE(value.length, 4);
  return Buffer.concat([h, value]);
};
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
const record = (kind: string, id: number, payload: Buffer, compressed = false) => {
  const h = Buffer.alloc(24);
  h.write(kind);
  h.writeUInt32LE(id, 12);
  if (compressed) {
    h.writeUInt32LE(0x40000, 8);
    payload = Buffer.concat([u32(payload.length), deflateSync(payload)]);
  }
  h.writeUInt32LE(payload.length, 4);
  return Buffer.concat([h, payload]);
};
const group = (label: number, kind: number, payload: Buffer) => {
  const h = Buffer.alloc(24);
  h.write('GRUP');
  h.writeUInt32LE(payload.length + 24, 4);
  h.writeUInt32LE(label, 8);
  h.writeInt32LE(kind, 12);
  return Buffer.concat([h, payload]);
};
function fixture(compressed: boolean, { multiple = true, successor = '', owner = 1, timing = '' } = {}) {
  const trdt1 = Buffer.alloc(24),
    trdt2 = Buffer.alloc(24);
  trdt1[12] = 1;
  trdt2[12] = 2;
  const timingData = Buffer.alloc(timing === 'legacy' ? 8 : 4);
  if (timing === 'legacy') {
    timingData.writeUInt16LE(7, 0);
    timingData.writeUInt16LE(0x1206, 2);
    timingData.writeFloatLE(1.5 / 24, 4);
  } else {
    timingData.writeUInt16LE(0x1206, 0);
    timingData.writeUInt16LE(Math.round(1.5 * 2730.625), 2);
  }
  const hedr = Buffer.alloc(12);
  hedr.writeUInt32LE(successor ? 5 : 4, 4);
  hedr.writeUInt32LE(0x804, 8);
  const header = record(
    'TES4',
    0,
    Buffer.concat([sub('HEDR', hedr), sub('MAST', Buffer.from('Skyrim.esm\0'))]),
  );
  const topic = record(
    'DIAL',
    0x01000801,
    Buffer.concat([
      sub('QNAM', u32(0x01000800)),
      sub('SNAM', Buffer.from('IDLE')),
      sub('TIFC', u32(successor ? 2 : 1)),
    ]),
  );
  const info = record(
    'INFO',
    (owner << 24) | 0x802,
    Buffer.concat([
      ...(timing ? [sub(timing === 'legacy' ? 'DATA' : 'ENAM', timingData)] : []),
      sub('PNAM', u32(0)),
      sub('TRDT', trdt1),
      sub('NAM1', Buffer.from('Original\0')),
      sub('NAM2', Buffer.from('First response notes\0')),
      sub('SNAM', u32(0x100)),
      ...(multiple ? [sub('TRDT', trdt2), sub('NAM1', Buffer.from('Second\0'))] : []),
      sub('ANAM', u32(0x01000815)),
    ]),
    compressed,
  );
  const next = successor
    ? record(
        'INFO',
        0x01000803,
        Buffer.concat([
          sub('PNAM', u32(0x01000802)),
          ...(successor === 'shared' ? [sub('DNAM', u32(0x01000802))] : []),
          sub('TRDT', trdt1),
          sub('NAM1', Buffer.from('Next\0')),
        ]),
        true,
      )
    : Buffer.alloc(0);
  return Buffer.concat([
    header,
    group(0, 0, Buffer.concat([topic, group(0x01000801, 7, Buffer.concat([info, next]))])),
  ]);
}
for (const compressed of [false, true])
  test(`edit one response and preserve backup (compressed: ${compressed})`, () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'edit-line-'));
    try {
      const file = path.join(dir, 'mod.esp'),
        original = fixture(compressed);
      writeFileSync(file, original);
      const input = {
        questFormId: '01000800',
        info: '01000802',
        response: 1,
        expectedText: 'Original',
        text: 'A different line.',
      };
      const result = editDialogue(file, path.join(dir, 'backup'), input, () => {});
      assert.deepEqual(readFileSync(result.backup!), original);
      assert.deepEqual(
        parseDialogue(readFileSync(file), '01000800').map((x) => x.text),
        ['A different line.', 'Second'],
      );
      assert.throws(() => editDialogue(file, path.join(dir, 'backup'), input, () => {}), /changed since/);
      assert.throws(
        () => editDialogue(file, path.join(dir, 'backup'), { ...input, questFormId: '01009999' }, () => {}),
        /does not belong/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

for (const compressed of [false, true])
  for (const timing of ['compact', 'legacy', ''])
    test(`edit INFO timing only, with a complete backup (${timing || 'missing'}, compressed: ${compressed})`, () => {
      const directory = mkdtempSync(path.join(os.tmpdir(), 'edit-timing-'));
      try {
        const file = path.join(directory, 'mod.esp'),
          original = fixture(compressed, { timing });
        writeFileSync(file, original);
        const before = parseDialogue(original, '01000800');
        const input = {
          questFormId: '01000800',
          info: '01000802',
          response: 1,
          expectedText: 'Original',
          expectedResetHours: before[0].resetHours!,
          expectedSayOnce: before[0].sayOnce!,
          resetHours: 0.5,
          sayOnce: false,
        };
        let checked = 0;
        const result = editDialogueTiming(file, path.join(directory, 'backup'), input, () => {
          checked++;
        });
        assert.equal(checked, 1);
        assert.deepEqual(readFileSync(result.backup!), original);
        const modified = readFileSync(file),
          after = parseDialogue(modified, '01000800');
        assert.deepEqual(
          after.map((line) => line.text),
          ['Original', 'Second'],
        );
        assert.equal(after[0].responseCount, 2);
        assert.equal(after[0].resetHours, after[1].resetHours);
        assert.equal(after[0].sayOnce, false);
        assert.ok(Math.abs(after[0].resetHours! - 0.5) < 0.0002);
        assert.equal(result.resetHours, after[0].resetHours);
        const originalRecords = [...records(original)],
          changedRecords = [...records(modified)];
        assert.equal(originalRecords.length, changedRecords.length);
        for (let i = 0; i < originalRecords.length; i++) {
          if (originalRecords[i].type !== 'INFO')
            assert.deepEqual(changedRecords[i].data, originalRecords[i].data);
          else {
            const unchanged = (data: Buffer) =>
              [...fields(data)].filter(([type]) => !['ENAM', 'DATA'].includes(type));
            assert.deepEqual(unchanged(changedRecords[i].data), unchanged(originalRecords[i].data));
            const data = new Map(fields(changedRecords[i].data));
            if (timing === 'legacy') {
              assert.equal(data.get('DATA')!.readUInt16LE(0), 7);
              assert.equal(data.get('DATA')!.readUInt16LE(2), 0x1202);
              assert.equal(data.get('DATA')!.readFloatLE(4), Math.fround(0.5 / 24));
              assert.equal(data.has('ENAM'), false);
            } else {
              assert.equal(data.get('ENAM')!.readUInt16LE(0), timing ? 0x1202 : 0);
              assert.equal(data.get('ENAM')!.readUInt16LE(2), Math.round(0.5 * 2730.625));
            }
          }
        }
        assert.throws(
          () => editDialogueTiming(file, path.join(directory, 'backup'), input, () => {}),
          /timing changed/,
        );
        assert.deepEqual(readFileSync(file), modified);
        const unchanged = editDialogueTiming(
          file,
          path.join(directory, 'backup'),
          {
            ...input,
            expectedResetHours: result.resetHours,
            expectedSayOnce: false,
            resetHours: result.resetHours,
          },
          () => {},
        );
        assert.equal(unchanged.unchanged, true);
        const final = editDialogueTiming(
          file,
          path.join(directory, 'backup'),
          {
            ...input,
            expectedResetHours: result.resetHours,
            expectedSayOnce: false,
            resetHours: timing === 'legacy' ? 48 : 24,
            sayOnce: true,
          },
          () => {},
        );
        assert.equal(final.resetHours, timing === 'legacy' ? 48 : 24);
        assert.equal(final.sayOnce, true);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });

test('timing edits reject invalid values, stale text, masters and an open editor without writing', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'reject-timing-'));
  try {
    const file = path.join(directory, 'mod.esp'),
      original = fixture(false);
    const input = {
      questFormId: '01000800',
      info: '01000802',
      response: 1,
      expectedText: 'Original',
      expectedResetHours: 0,
      expectedSayOnce: false,
      resetHours: 1,
      sayOnce: false,
    };
    writeFileSync(file, original);
    for (const resetHours of [-1, 24.01, Infinity, NaN]) {
      assert.throws(
        () => editDialogueTiming(file, directory, { ...input, resetHours }, () => {}),
        /reset hours|timing/i,
      );
      assert.deepEqual(readFileSync(file), original);
    }
    assert.throws(
      () => editDialogueTiming(file, directory, { ...input, expectedText: 'Old line' }, () => {}),
      /changed since/,
    );
    assert.throws(
      () =>
        editDialogueTiming(file, directory, input, () => {
          throw Error('Editor is open.');
        }),
      /Editor is open/,
    );
    const master = fixture(false, { owner: 0 });
    writeFileSync(file, master);
    assert.throws(
      () => editDialogueTiming(file, directory, { ...input, info: '00000802' }, () => {}),
      /owned by/,
    );
    assert.deepEqual(readFileSync(file), master);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

const deletion = {
  questFormId: '01000800',
  info: '01000802',
  response: 1,
  expectedText: 'Original',
};

for (const compressed of [false, true])
  test(`delete only the selected response and its metadata (compressed: ${compressed})`, () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'delete-line-'));
    try {
      const file = path.join(dir, 'mod.esp');
      const original = fixture(compressed);
      writeFileSync(file, original);
      const result = deleteDialogue(file, path.join(dir, 'backup'), deletion, () => {});
      assert.deepEqual(readFileSync(result.backup), original);
      const modified = readFileSync(file);
      const [remaining] = parseDialogue(modified, deletion.questFormId);
      assert.equal(remaining.info, deletion.info);
      assert.equal(remaining.response, 2);
      assert.equal(remaining.speaker, '01000815');
      assert.deepEqual(
        parseDialogue(modified, deletion.questFormId).map((line) => line.text),
        ['Second'],
      );
      const info = [...records(modified)].find((item) => item.type === 'INFO')!;
      assert.deepEqual(
        [...fields(info.data)].map(([type]) => type),
        ['PNAM', 'TRDT', 'NAM1', 'ANAM'],
      );
      assert.throws(() => deleteDialogue(file, path.join(dir, 'backup'), deletion, () => {}), /not found/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

test('delete a whole INFO, preserve the following INFO and update record counts', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'delete-info-'));
  try {
    const file = path.join(dir, 'mod.esp');
    writeFileSync(file, fixture(true, { multiple: false, successor: 'linked' }));
    deleteDialogue(file, path.join(dir, 'backup'), deletion, () => {});
    const modified = readFileSync(file);
    const [head, topic, next] = [...records(modified)];
    assert.equal(new Map(fields(head.data)).get('HEDR')?.readUInt32LE(4), 4);
    assert.equal(new Map(fields(head.data)).get('HEDR')?.readUInt32LE(8), 0x804);
    assert.equal(new Map(fields(topic.data)).get('TIFC')?.readUInt32LE(), 1);
    assert.equal(new Map(fields(next.data)).get('PNAM')?.readUInt32LE(), 0);
    assert.deepEqual(
      parseDialogue(modified, deletion.questFormId).map((line) => line.text),
      ['Next'],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the last line in a topic can be deleted and a new line added later', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'delete-last-line-'));
  try {
    const file = path.join(dir, 'mod.esp'),
      backup = path.join(dir, 'backup');
    writeFileSync(file, fixture(false, { multiple: false }));
    deleteDialogue(file, backup, deletion, () => {});
    assert.deepEqual(parseDialogue(readFileSync(file), deletion.questFormId), []);
    const created = createStageDialogue(
      file,
      backup,
      {
        text: 'New line.',
        type: 'IDLE',
        ownerFormId: deletion.questFormId,
        gameFormId: deletion.questFormId,
        speakerFormId: '01000815',
        stage: 10,
      },
      () => {},
    );
    const [line] = parseDialogue(readFileSync(file), deletion.questFormId);
    assert.equal(created.info.toUpperCase(), line.info);
    assert.equal(line.text, 'New line.');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('deletion protects master dialogue, shared responses and stale selections', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'delete-protected-line-'));
  try {
    const file = path.join(dir, 'mod.esp'),
      backup = path.join(dir, 'backup');
    const cases = [
      { original: fixture(false, { owner: 0 }), input: { ...deletion, info: '00000802' }, error: /owned by/ },
      {
        original: fixture(false, { multiple: false, successor: 'shared' }),
        input: deletion,
        error: /shared response/,
      },
      { original: fixture(false), input: { ...deletion, expectedText: 'Old text' }, error: /changed since/ },
    ];
    for (const { original, input, error } of cases) {
      writeFileSync(file, original);
      assert.throws(() => deleteDialogue(file, backup, input, () => {}), error);
      assert.deepEqual(readFileSync(file), original);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
