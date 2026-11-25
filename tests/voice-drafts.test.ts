import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  consumeDraft,
  createDraft,
  draftFor,
  installDraft,
  replaceDraft,
  generateSpeech,
} from '../backend/src/voice-drafts.js';
const wav = () => {
  const b = Buffer.alloc(48);
  b.write('RIFF');
  b.writeUInt32LE(40, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(4, 40);
  return b;
};
test('drafts are scoped to project and text; WAV and LIP install without overwriting', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'voice-draft-'));
  try {
    const id = createDraft(123, 'A line.', wav()),
      d = draftFor(123, id, 'A line.');
    assert.throws(() => draftFor(124, id));
    assert.throws(() => draftFor(123, id, 'Changed'));
    assert.throws(() => installDraft(dir, 'test.esp', 'BjornVoice', 'Quest', 'Topic', '01000900', d));
    d.lip = Buffer.alloc(24);
    d.lip.writeUInt32LE(1);
    d.lip.writeUInt32LE(13, 8);
    const files = installDraft(dir, 'test.esp', 'BjornVoice', 'Quest', 'Topic', '01000900', d);
    assert.deepEqual(readFileSync(files.wav), wav());
    assert.deepEqual(readFileSync(files.lip), d.lip);
    const second = installDraft(dir, 'test.esp', 'BjornVoice', 'Quest', 'Topic', '01000900', d, 2);
    assert.match(second.wav, /quest_topic_00000900_2\.wav$/);
    assert.deepEqual(readFileSync(second.wav), wav());
    assert.throws(() => installDraft(dir, 'test.esp', 'BjornVoice', 'Quest', 'Topic', '01000900', d));
    assert.deepEqual(readFileSync(files.wav), wav());
    const updated = createDraft(123, 'A line.', wav()),
      replacement = draftFor(123, updated);
    replacement.wav[44] = 42;
    replacement.lip = Buffer.alloc(24, 7);
    replaceDraft(files.wav, replacement);
    assert.equal(readFileSync(files.wav)[44], 42);
    assert.deepEqual(readFileSync(files.lip), replacement.lip);
    assert.deepEqual(readFileSync(second.wav), wav());
    assert.throws(() => createDraft(123, 'A line.', Buffer.from('bad')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('a valid preview replaces only the draft for the same project and dialogue', () => {
  const slot = 'line:01000900:1';
  const first = createDraft(123, 'Same text.', wav(), slot);
  const otherLine = createDraft(123, 'Same text.', wav(), 'line:01000900:2');
  const otherProject = createDraft(124, 'Same text.', wav(), slot);
  const original = draftFor(123, first);
  original.lip = Buffer.alloc(24);
  assert.throws(() => createDraft(123, 'Same text.', Buffer.from('bad'), slot));
  assert.equal(draftFor(123, first), original);

  const audio = wav();
  audio[44] = 42;
  const latest = createDraft(123, 'Same text.', audio, slot);
  assert.throws(() => draftFor(123, first), { status: 404 });
  assert.equal(draftFor(123, latest).wav[44], 42);
  assert.equal(draftFor(123, latest).lip, undefined);
  assert.equal(draftFor(123, otherLine).wav[44], 0);
  assert.equal(draftFor(124, otherProject).wav[44], 0);
  for (const id of [latest, otherLine, otherProject]) consumeDraft(id);
});
test('more than 100 distinct dialogues can have previews', () => {
  const ids: string[] = [];
  try {
    for (let i = 0; i < 105; i++) ids.push(createDraft(123, 'A line.', wav(), `line:${i}:1`));
    for (const id of ids) assert.deepEqual(draftFor(123, id).wav, wav());
  } finally {
    for (const id of ids) consumeDraft(id);
  }
});
test('ElevenLabs PCM is wrapped in a valid WAV without exposing the key', async () => {
  const original = globalThis.fetch;
  let sent = '';
  globalThis.fetch = async (_url, options) => {
    sent = String(options?.body);
    return new Response(Buffer.alloc(400), { status: 200 });
  };
  try {
    const result = await generateSpeech('Hello', 'secret', 'voice-id');
    assert.equal(result.toString('ascii', 0, 4), 'RIFF');
    assert.equal(result.toString('ascii', 8, 12), 'WAVE');
    assert.ok(sent.includes('Hello'));
    assert.ok(!sent.includes('secret'));
    await generateSpeech('Hello', 'secret', 'voice-id', 'eleven_v4');
    const request = JSON.parse(sent);
    assert.equal(request.model_id, 'eleven_v4');
    assert.equal(request.voice_settings.style, undefined);
    assert.equal(request.voice_settings.speed, undefined);
  } finally {
    globalThis.fetch = original;
  }
});
