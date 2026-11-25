import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { DialogueCategories } from '../frontend/src/DialogueCategories';
import { QuestDialogueList } from '../frontend/src/QuestDialogueList';
import type { DialogueCategory } from '../shared/dialogue-categories';
import type { VoiceFilter } from '../shared/skyrim-dialogue';

const noop = () => {};
const lines = [
  {
    info: '01000901',
    response: 1,
    text: 'You picked the wrong fight!',
    topicType: 'ATCK',
    topicCategory: 3,
    voices: [{ voice: 'FollowerVoice', file: 'attack.wav' }],
  },
  { info: '01000902', response: 1, text: '', topicType: 'GRNT', voices: [] },
  { info: '01000903', response: 1, text: 'Hello, friend.', topicType: 'HELO', voices: [] },
];
function renderList(category: DialogueCategory = 'combat', query = '', voiceFilter: VoiceFilter = '') {
  return renderToStaticMarkup(
    <QuestDialogueList
      projectId={1}
      questId="FollowerQuest"
      lines={lines}
      category={category}
      query={query}
      voiceFilter={voiceFilter}
      onDeleted={noop}
      onTextSaved={noop}
      onVoiceSaved={noop}
    />,
  );
}

test('quest categories show counts and keep the stage overview available', () => {
  const html = renderToStaticMarkup(<DialogueCategories lines={lines} value="combat" onChange={noop} />);
  assert.match(html, /aria-label="Dialogue categories"/);
  assert.match(html, />Stages<\/button>/);
  assert.match(html, /Hello <small>1<\/small>/);
  assert.match(html, /aria-pressed="true"[^>]*>Combat <small>2<\/small>/);
  assert.doesNotMatch(html, />Other/);
});

test('combat inside a quest shows responses without stage conditions or subtitles and retains the editors', () => {
  const html = renderList();
  assert.match(html, /Combat · 2 of 2 responses/);
  assert.match(html, /You picked the wrong fight!/);
  assert.match(html, /No subtitle/);
  assert.match(html, /Edit text/);
  assert.match(html, /Redo voice/);
  assert.match(html, /All combat events/);
  assert.doesNotMatch(html, /Hello, friend\./);
});

test('quest category search and voice filters combine without showing unrelated types', () => {
  const voiced = renderList('combat', 'wrong', 'with-voice');
  assert.match(voiced, /Combat · 1 of 2 responses/);
  assert.match(voiced, /You picked the wrong fight!/);
  assert.doesNotMatch(voiced, /No subtitle/);
  const silent = renderList('combat', '', 'no-voice');
  assert.match(silent, /No subtitle/);
  assert.doesNotMatch(silent, /You picked the wrong fight!/);
  assert.match(renderList('hello'), /Hello, friend\./);
  assert.match(renderList('idle'), /No idle dialogue found for this quest\./);
});

test('category lists keep master-owned responses read-only', () => {
  const html = renderToStaticMarkup(
    <QuestDialogueList
      projectId={1}
      questId="FollowerQuest"
      lines={[{ ...lines[0], canDelete: false }]}
      category="combat"
      query=""
      voiceFilter=""
      onDeleted={noop}
      onTextSaved={noop}
      onVoiceSaved={noop}
    />,
  );
  assert.match(html, /You picked the wrong fight!/);
  assert.doesNotMatch(html, /Edit text|Redo voice|Delete dialogue/);
});
