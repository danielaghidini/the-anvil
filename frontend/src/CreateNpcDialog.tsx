import { X } from 'lucide-react';
import React, { useState } from 'react';

export function CreateNpcDialog({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: number;
  onClose: () => void;
  onCreated: (npc: { formId: string; editorId: string }) => void;
}) {
  const [editorId, setEditorId] = useState(''),
    [name, setName] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const validId = /^[A-Za-z][A-Za-z0-9_]{1,98}$/.test(editorId.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/projects/${projectId}/npcs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editorId: editorId.trim(), ...(name.trim() ? { name: name.trim() } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not create the NPC.');
      onCreated(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the NPC.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={() => !busy && onClose()}>
      <form className="dialog create-quest-dialog" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h2>Create New NPC</h2>
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
              placeholder="MyModNewNpc"
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
              placeholder="Shown in game"
            />
          </label>
          <p className="hint create-quest-note">
            Creates a blank NPC (male Nord, Citizen class, MaleEvenToned voice) in the plugin with a backup.
            Close the Creation Kit first, then set appearance, stats, and placement there, and export the face
            (Ctrl+F4).
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
            {busy ? 'Creating…' : 'Create NPC'}
          </button>
        </footer>
      </form>
    </div>
  );
}
