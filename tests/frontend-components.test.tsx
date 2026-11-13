import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { AddIdleDialog } from '../frontend/src/AddIdleDialog';
import { NpcSelector } from '../frontend/src/NpcSelector';
import { QuestCoverage } from '../frontend/src/QuestCoverage';

const noop = () => {};
const count = (html: string, pattern: RegExp) => html.match(new RegExp(pattern, 'g'))?.length ?? 0;

test('QuestCoverage reports covered stages and renders nothing without stages', () => {
  const html = renderToStaticMarkup(
    <QuestCoverage
      stages={[
        { number: 10, lines: [1] },
        { number: 20, lines: [] },
        { number: 30, lines: [1, 2] },
      ]}
    />,
  );
  assert.match(html, /Stages with direct dialogue · 2 of 3/);
  assert.match(html, /<strong>67%<\/strong>/);
  assert.match(html, /aria-valuenow="2"/);
  assert.match(html, /aria-valuemax="3"/);
  assert.match(html, /width:67%/);
  assert.equal(renderToStaticMarkup(<QuestCoverage stages={[]} />), '');
});

test('QuestCoverage leaves ignored stages out of the percentage', () => {
  const html = renderToStaticMarkup(
    <QuestCoverage
      stages={[
        { number: 10, lines: [1] },
        { number: 20, lines: [] },
        { number: 30, lines: [1, 2] },
      ]}
      isIgnored={(stage) => stage.number === 20}
    />,
  );
  assert.match(html, /Stages with direct dialogue · 2 of 2 · 1 ignored/);
  assert.match(html, /<strong>100%<\/strong>/);
});

test('NpcSelector lists NPCs, marks selected ones and flags missing selections', () => {
  const npcs = [
    { formId: '0001A2B3', editorId: 'BjornNPC', name: 'Bjorn' },
    { formId: '0001A2B4', editorId: '', name: '' },
  ];
  const html = renderToStaticMarkup(
    <NpcSelector npcs={npcs} selected={['0001A2B3', 'DEADBEEF']} onChange={noop} />,
  );
  assert.match(html, /NPCs in the plugin \(2 selected\)/);
  assert.match(html, /Bjorn · BjornNPC · 0001A2B3/);
  assert.match(html, /Unnamed NPC · No Editor ID · 0001A2B4/);
  assert.match(html, /NPC DEADBEEF was not found in the plugin/);
  assert.equal(count(html, /checked=""/), 2);
  assert.doesNotMatch(html, /No NPCs found/);
});

test('NpcSelector shows loading and empty states', () => {
  assert.match(
    renderToStaticMarkup(<NpcSelector npcs={[]} selected={[]} onChange={noop} loading />),
    /Loading NPCs…/,
  );
  assert.match(
    renderToStaticMarkup(<NpcSelector npcs={[]} selected={[]} onChange={noop} />),
    /No NPCs found\./,
  );
});

function renderDialog(
  destinations: { id: string; name?: string }[] = [{ id: 'BjornQuest', name: 'Darkened Fate' }],
) {
  return renderToStaticMarkup(
    <AddIdleDialog
      projectId={1}
      stage={20}
      questLabel="Darkened Fate"
      stages={[10, 20, 30]}
      destinations={destinations}
      onClose={noop}
      onSaved={noop}
    />,
  );
}

test('AddIdleDialog places conditions below both columns, outside the audio column', () => {
  const html = renderDialog();
  assert.match(html, /Add dialogue · Stage 20/);
  const side = html.indexOf('class="idle-dialog-side"');
  const audio = html.indexOf('class="idle-audio"');
  const conditions = html.indexOf('class="idle-conditions"');
  assert.ok(side > 0 && audio > side && conditions > audio);
  // The side column closes right after the audio section, before the conditions start.
  assert.match(html.slice(audio), /^[^]*?<\/section><\/div><section class="idle-conditions"/);
  assert.match(html, /Quest stage = 20/);
  assert.match(html, /Quest conditions refer to Darkened Fate/);
});

test('AddIdleDialog starts with saving and audio actions disabled until a line and audio exist', () => {
  const html = renderDialog();
  assert.match(html, /<button class="primary" disabled="">Save dialogue<\/button>/);
  for (const label of ['Load WAV', 'Generate with AI', 'Generate lipsync']) {
    assert.match(html, new RegExp(`<button type="button" class="secondary" disabled="">${label}</button>`));
  }
  assert.match(html, /<button type="button" class="secondary">\+ Add condition<\/button>/);
});

test('AddIdleDialog shows a fixed destination for one quest and a picker for several', () => {
  assert.match(renderDialog(), /<div class="idle-destination">Darkened Fate<\/div>/);
  const many = renderDialog([{ id: 'QuestA', name: 'First quest' }, { id: 'QuestB' }]);
  assert.doesNotMatch(many, /idle-destination/);
  assert.match(many, /aria-label="Destination quest"/);
  assert.match(many, />QuestB</);
});
