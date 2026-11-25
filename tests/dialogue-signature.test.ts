import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAllDialogue } from '../backend/src/quest-dialogue.js';

const sub = (name: string, data: Buffer) => {
  const h = Buffer.alloc(6);
  h.write(name);
  h.writeUInt16LE(data.length, 4);
  return Buffer.concat([h, data]);
};
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
const record = (name: string, id: number, data: Buffer) => {
  const h = Buffer.alloc(24);
  h.write(name);
  h.writeUInt32LE(data.length, 4);
  h.writeUInt32LE(id, 12);
  return Buffer.concat([h, data]);
};
const group = (label: number, kind: number, items: Buffer) => {
  const h = Buffer.alloc(24);
  h.write('GRUP');
  h.writeUInt32LE(items.length + 24, 4);
  h.writeUInt32LE(label, 8);
  h.writeInt32LE(kind, 12);
  return Buffer.concat([h, items]);
};
// GetVMQuestVariable with its variable name in CIS2; `pointer` mimics the address the Creation Kit
// leaves in the CTDA parameter slot.
function plugin(pointer: number, variable: string) {
  const ctda = Buffer.alloc(32);
  ctda.writeUInt16LE(629, 8);
  ctda.writeUInt32LE(0x01000800, 12);
  ctda.writeUInt32LE(pointer, 16);
  ctda.writeUInt32LE(0xffffffff, 28);
  const topic = record(
    'DIAL',
    0x01000801,
    Buffer.concat([sub('QNAM', u32(0x01000800)), sub('SNAM', Buffer.from('IDLE'))]),
  );
  const info = record(
    'INFO',
    0x01000802,
    Buffer.concat([
      sub('TRDT', Buffer.from('000000000000000000000000010000000000000001000000', 'hex')),
      sub('NAM1', Buffer.from('Hello\0')),
      sub('CTDA', ctda),
      sub('CIS2', Buffer.from(variable + '\0')),
    ]),
  );
  return Buffer.concat([group(0, 0, Buffer.concat([topic, group(0x01000801, 7, info)]))]);
}
const signature = (b: Buffer) => parseAllDialogue(b).get('01000800')?.[0]?.conditionSignature;

test('condition signatures ignore the Creation Kit address left in string parameter slots', () => {
  const first = signature(plugin(0x5239f530, '::Var_var'));
  assert.ok(first);
  assert.equal(signature(plugin(0x5483f530, '::Var_var')), first);
  assert.notEqual(signature(plugin(0x5239f530, '::Other_var')), first);
});
