import test from 'node:test';
import assert from 'node:assert/strict';
import { orderQuests, questCallsFromSource, vmadObjectProperties } from '../backend/src/quest-order.js';

const quest = (id: string, formId: string) => ({ id, formId, stages: [0, 10, 20] });

test('questCallsFromSource finds quest starts and stage changes on properties, not the own quest', () => {
  const calls = questCallsFromSource(`
    ; NextQuest.Start() in a comment is ignored
    Function Fragment_1()
      NextQuest.Start()
      (Other as Quest).SetStage(10)
      GetOwningQuest().SetStage(20)
      Later.SetCurrentStageID(30)
    EndFunction`);
  assert.deepEqual(calls, [
    { property: 'nextquest', kind: 'start' },
    { property: 'other', kind: 'setStage', stage: 10 },
    { property: 'later', kind: 'setStage', stage: 30 },
  ]);
});

test('vmadObjectProperties keeps plain object properties and skips aliases', () => {
  const parts: Buffer[] = [];
  const u16 = (n: number) => {
      const b = Buffer.alloc(2);
      b.writeUInt16LE(n);
      return b;
    },
    str = (s: string) => Buffer.concat([u16(s.length), Buffer.from(s)]),
    object = (formId: number, alias: number) => {
      const b = Buffer.alloc(8);
      b.writeInt16LE(alias, 2);
      b.writeUInt32LE(formId, 4);
      return b;
    };
  parts.push(u16(5), u16(2), u16(1), str('QF_Test'), Buffer.from([0]), u16(3));
  parts.push(str('NextQuest'), Buffer.from([1, 1]), object(0x01000801, -1));
  parts.push(str('Alias_Bjorn'), Buffer.from([1, 1]), object(0x01000802, 0));
  parts.push(str('Count'), Buffer.from([3, 1]), Buffer.alloc(4));
  const [script] = vmadObjectProperties(Buffer.concat(parts));
  assert.equal(script.script, 'QF_Test');
  assert.deepEqual([...script.properties], [['nextquest', '01000801']]);
});

test('orderQuests follows start chains and uses weak evidence only to break ties', () => {
  const quests = [
    quest('Side', '01000001'),
    quest('Third', '01000002'),
    quest('First', '01000003'),
    quest('Second', '01000004'),
  ];
  const order = orderQuests(
    quests,
    [
      { from: 'First', to: 'Second', weight: 3 },
      { from: 'Second', to: 'Third', weight: 3 },
      // Weak evidence against the chain must not reorder it.
      { from: 'Third', to: 'First', weight: 1 },
    ],
    new Set(['First']),
  );
  assert.deepEqual(order, ['First', 'Second', 'Third', 'Side']);
});

test('orderQuests still orders every quest when starts form a cycle', () => {
  const quests = [quest('A', '01000001'), quest('B', '01000002'), quest('C', '01000003')];
  const order = orderQuests(
    quests,
    [
      { from: 'A', to: 'B', weight: 3 },
      { from: 'B', to: 'C', weight: 3 },
      { from: 'C', to: 'A', weight: 3 },
    ],
    new Set(),
  );
  assert.deepEqual([...order].sort(), ['A', 'B', 'C']);
});
