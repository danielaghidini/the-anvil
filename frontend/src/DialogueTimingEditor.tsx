import { useEffect, useState } from 'react';
import {
  displayResetHours,
  type DialogueTiming,
  type DialogueTimingFields,
} from '../../shared/dialogue-timing';

export function DialogueTimingInputs({
  hours,
  sayOnce,
  onHours,
  onSayOnce,
  disabled = false,
  legacy = false,
}: {
  hours: string;
  sayOnce: boolean;
  onHours: (hours: string) => void;
  onSayOnce: (sayOnce: boolean) => void;
  disabled?: boolean;
  legacy?: boolean;
}) {
  return (
    <div className="dialogue-timing-fields">
      <label>
        Hours until reset
        <input
          type="number"
          min="0"
          max={legacy ? undefined : 24}
          step="0.01"
          required
          value={hours}
          disabled={disabled}
          onChange={(e) => onHours(e.target.value)}
        />
      </label>
      <label className="dialogue-say-once" title="Clear Say once to allow this INFO to repeat.">
        <input
          type="checkbox"
          checked={sayOnce}
          disabled={disabled}
          onChange={(e) => onSayOnce(e.target.checked)}
        />{' '}
        Say once
      </label>
    </div>
  );
}

export function DialogueTimingEditor({
  url,
  text,
  line,
  onSaved,
  readOnly = false,
}: {
  url: string;
  text: string;
  line: DialogueTimingFields;
  onSaved?: (timing: DialogueTiming) => void;
  readOnly?: boolean;
}) {
  const [current, setCurrent] = useState<DialogueTiming>({
    resetHours: line.resetHours ?? 0,
    sayOnce: line.sayOnce ?? false,
    timingFormat: line.timingFormat ?? 'compact',
  });
  const [hours, setHours] = useState(displayResetHours(current.resetHours));
  const [sayOnce, setSayOnce] = useState(current.sayOnce);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    const next = {
      resetHours: line.resetHours ?? 0,
      sayOnce: line.sayOnce ?? false,
      timingFormat: line.timingFormat ?? 'compact',
    } as DialogueTiming;
    setCurrent(next);
    setHours(displayResetHours(next.resetHours));
    setSayOnce(next.sayOnce);
  }, [line.resetHours, line.sayOnce, line.timingFormat]);
  const numericHours = hours.trim() ? Number(hours) : NaN;
  const valid =
    Number.isFinite(numericHours) &&
    numericHours >= 0 &&
    (current.timingFormat === 'legacy' || numericHours <= 24);
  const hoursChanged = hours !== displayResetHours(current.resetHours);
  async function save() {
    if (!valid) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${url}/timing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resetHours: hoursChanged ? numericHours : current.resetHours,
          sayOnce,
          expectedResetHours: current.resetHours,
          expectedSayOnce: current.sayOnce,
          expectedText: text,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not save dialogue timing.');
      const timing: DialogueTiming = {
        resetHours: result.resetHours,
        sayOnce: result.sayOnce,
        timingFormat: result.timingFormat,
      };
      setCurrent(timing);
      setHours(displayResetHours(timing.resetHours));
      setSayOnce(timing.sayOnce);
      setOpen(false);
      onSaved?.(timing);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save dialogue timing.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="dialogue-timing">
      <small>
        {line.timingEditable === false
          ? 'Timing unavailable'
          : `${current.sayOnce ? 'Say once · ' : ''}Reset: ${displayResetHours(current.resetHours)} game hours`}
      </small>
      {!readOnly &&
        line.timingEditable !== false &&
        (!open ? (
          <button
            type="button"
            className="dialogue-voice-edit"
            onClick={() => {
              setHours(displayResetHours(current.resetHours));
              setSayOnce(current.sayOnce);
              setError('');
              setOpen(true);
            }}
          >
            Edit timing
          </button>
        ) : (
          <div className="dialogue-text-editor dialogue-timing-editor">
            <DialogueTimingInputs
              hours={hours}
              sayOnce={sayOnce}
              onHours={setHours}
              onSayOnce={setSayOnce}
              disabled={busy}
              legacy={current.timingFormat === 'legacy'}
            />
            {(line.responseCount ?? 1) > 1 && (
              <p className="dialogue-timing-note">
                This timing applies to all {line.responseCount} responses in this INFO.
              </p>
            )}
            {current.timingFormat === 'compact' && (
              <small className="dialogue-timing-range">Allowed range: 0–24 game hours.</small>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="dialogue-timing-actions">
              <button
                type="button"
                className="primary"
                disabled={busy || !valid || (!hoursChanged && sayOnce === current.sayOnce)}
                onClick={() => void save()}
              >
                Save timing
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        ))}
    </div>
  );
}
