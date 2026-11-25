import { X } from 'lucide-react';
import React, { useState } from 'react';
import { AssignmentSelect } from './QuestDashboard';

// Values are the QUST DNAM type codes, listed in the order people usually pick them.
const questTypes: { value: number; label: string }[] = [
  { value: 8, label: 'Side Quest' },
  { value: 6, label: 'Miscellaneous' },
  { value: 1, label: 'Main Quest' },
  { value: 7, label: 'Daedric' },
  { value: 5, label: 'Companions' },
  { value: 2, label: 'College of Winterhold' },
  { value: 3, label: "Thieves' Guild" },
  { value: 4, label: 'Dark Brotherhood' },
  { value: 9, label: 'Civil War' },
  { value: 10, label: 'Dawnguard' },
  { value: 11, label: 'Dragonborn' },
  { value: 0, label: 'None (not in the journal)' },
];

export function CreateQuestDialog({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: number;
  onClose: () => void;
  onCreated: (quest: { formId: string; editorId: string }) => void;
}) {
  const [editorId, setEditorId] = useState(''),
    [name, setName] = useState(''),
    [type, setType] = useState(8),
    [priority, setPriority] = useState(50),
    [startGameEnabled, setStartGameEnabled] = useState(true),
    [runOnce, setRunOnce] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const validId = /^[A-Za-z][A-Za-z0-9_]{1,98}$/.test(editorId.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/projects/${projectId}/quests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          editorId: editorId.trim(),
          ...(name.trim() ? { name: name.trim() } : {}),
          type,
          priority,
          startGameEnabled,
          runOnce,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not create the quest.');
      onCreated(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the quest.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={() => !busy && onClose()}>
      <form className="dialog create-quest-dialog" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h2>Create New Quest</h2>
          <button type="button" className="close" aria-label="Close" disabled={busy} onClick={onClose}>
            <X size={24} aria-hidden="true" />
          </button>
        </div>
        <div className="dialog-body">
          <label>
            Editor ID
            <input
              required
              autoFocus
              maxLength={99}
              value={editorId}
              onChange={(e) => setEditorId(e.target.value.replace(/\s/g, ''))}
              placeholder="MyModNewQuest"
            />
          </label>
          {editorId && !validId && (
            <p className="hint">Start with a letter and use only letters, digits, or underscores.</p>
          )}
          <label>
            Name
            <input
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Shown in the journal"
            />
          </label>
          <div className="create-quest-row">
            <div className="create-quest-field">
              <span>Quest type</span>
              <AssignmentSelect
                value={String(type)}
                placeholder="Quest type"
                hidePlaceholder
                disabled={busy}
                options={questTypes.map(({ value, label }) => ({ value: String(value), label }))}
                onChange={(value) => setType(Number(value))}
              />
            </div>
            <label>
              Priority
              <input
                type="number"
                min={0}
                max={100}
                required
                value={priority}
                onChange={(e) =>
                  setPriority(Math.max(0, Math.min(100, Math.trunc(Number(e.target.value) || 0))))
                }
              />
            </label>
          </div>
          <div className="create-quest-flags">
            <label>
              <input
                type="checkbox"
                checked={startGameEnabled}
                onChange={(e) => setStartGameEnabled(e.target.checked)}
              />
              Start Game Enabled
            </label>
            <label>
              <input type="checkbox" checked={runOnce} onChange={(e) => setRunOnce(e.target.checked)} />
              Run Once
            </label>
          </div>
          <p className="hint create-quest-note">
            Creates the quest in the plugin with a backup. Close the Creation Kit first, then add stages,
            objectives, and aliases there.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer>
          <button type="button" className="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy || !validId}>
            {busy ? 'Creating…' : 'Create quest'}
          </button>
        </footer>
      </form>
    </div>
  );
}
