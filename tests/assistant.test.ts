import test from 'node:test';
import assert from 'node:assert/strict';
import { askAssistant, customRequest, type Provider } from '../backend/src/assistant.js';
const base = {
  key: 'test-secret',
  model: 'test-model',
  messages: [{ role: 'user' as const, content: 'Hello' }],
  project: { id: 1, name: 'A', plugin: 'a.esp', createdAt: '' },
  snapshot: {
    plugin: 'a.esp',
    masters: [],
    quests: [{ id: 'AQuest', formId: '01000800', stages: [10] }],
    importedAt: '',
  },
  lore: 'A lore',
  characters: [{ name: 'A follower' }],
};
for (const provider of ['openai', 'openrouter', 'gemini', 'anthropic'] as Provider[])
  test(`${provider} uses its own endpoint and request format`, async () => {
    let url = '',
      payload: any,
      headers: any;
    const mock: typeof fetch = async (input, init) => {
      url = String(input);
      payload = JSON.parse(String(init?.body));
      headers = init?.headers;
      return new Response(
        JSON.stringify(
          provider === 'anthropic'
            ? { content: [{ type: 'text', text: 'Reply' }] }
            : { choices: [{ message: { content: 'Reply' } }] },
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };
    assert.equal(await askAssistant({ ...base, provider }, mock), 'Reply');
    assert.ok(url.startsWith('https://'));
    assert.equal(payload.model, 'test-model');
    assert.ok(JSON.stringify(payload).includes('AQuest'));
    assert.ok(!JSON.stringify(payload).includes('test-secret'));
    assert.equal(
      provider === 'anthropic' ? headers['x-api-key'] : headers.Authorization,
      provider === 'anthropic' ? 'test-secret' : 'Bearer test-secret',
    );
  });
test('custom endpoints cannot send credentials to a local address', async () => {
  await assert.rejects(customRequest('http://127.0.0.1:4318/x', {}, '{}'), /public HTTPS/);
  await assert.rejects(customRequest('https://127.0.0.1/x', {}, '{}'), /public address/);
});
test('the open page and quest are sent as the current view', async () => {
  let payload: any;
  const mock: typeof fetch = async (_input, init) => {
    payload = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Reply' } }] }), { status: 200 });
  };
  await askAssistant(
    {
      ...base,
      provider: 'openai',
      view: {
        page: 'Skyrim Quests',
        quest: {
          source: 'skyrim',
          id: 'MQ301',
          name: 'The Fallen',
          group: 'Principal',
          plugin: 'Update.esm',
          stages: ['10 / obj. 10'],
          linkedProjectQuests: [{ id: 'AQuest', stages: [10] }],
        },
      },
    },
    mock,
  );
  const system = payload.messages[0].content as string;
  const reference = JSON.parse(system.slice(system.indexOf('{')));
  assert.equal(reference.currentView.page, 'Skyrim Quests');
  assert.equal(reference.currentView.quest.id, 'MQ301');
  assert.equal(reference.currentView.quest.linkedProjectQuests[0].id, 'AQuest');
  assert.match(system, /currentView/);
});
test('without a selection the current view is empty', async () => {
  let payload: any;
  const mock: typeof fetch = async (_input, init) => {
    payload = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Reply' }] }), { status: 200 });
  };
  await askAssistant({ ...base, provider: 'anthropic' }, mock);
  const reference = JSON.parse(payload.system.slice(payload.system.indexOf('{')));
  assert.deepEqual(reference.currentView, { page: null, quest: null });
});
