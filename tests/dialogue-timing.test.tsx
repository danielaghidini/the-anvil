import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { DialogueTimingEditor, DialogueTimingInputs } from '../frontend/src/DialogueTimingEditor';
const noop = () => {};
test('timing fields use game hours, accept fractions and expose Say once', () => {
  const html = renderToStaticMarkup(
    <DialogueTimingInputs hours="0.5" sayOnce onHours={noop} onSayOnce={noop} />,
  );
  assert.match(html, /Hours until reset/);
  assert.match(html, /type="number" min="0" max="24" step="0.01" required="" value="0.5"/);
  assert.match(html, /type="checkbox" checked=""/);
  assert.match(html, /Clear Say once/);
});
test('existing timing is displayed without losing the stored fractional precision', () => {
  const html = renderToStaticMarkup(
    <DialogueTimingEditor
      url="/timing"
      text="Hello."
      line={{
        resetHours: 0.4998855573357748,
        sayOnce: false,
        timingFormat: 'compact',
        responseCount: 2,
      }}
    />,
  );
  assert.match(html, /Reset: 0.5 game hours/);
  assert.match(html, /Edit timing/);
  assert.doesNotMatch(html, /Say once/);
});
test('read-only dialogue shows timing without an edit action', () => {
  const html = renderToStaticMarkup(
    <DialogueTimingEditor
      url="/timing"
      text="Hello."
      readOnly
      line={{
        resetHours: 2,
        sayOnce: true,
        timingFormat: 'compact',
      }}
    />,
  );
  assert.match(html, /Say once · Reset: 2 game hours/);
  assert.doesNotMatch(html, /Edit timing/);
});
