import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Trash2 } from 'lucide-react';
import { ExistingVoiceEditor } from './ExistingVoiceEditor';
import { DialogueTimingEditor } from './DialogueTimingEditor';
import type { DialogueTiming, DialogueTimingFields } from '../../shared/dialogue-timing';
import { combatEvents } from '../../shared/combat-dialogue';
export type VoiceChoice = { voice: string; file: string; speakers?: string[] };
let activeAudio: HTMLAudioElement | null = null;
const topicLabels: Record<string, string> = {
  ...combatEvents,
  CUST: 'Dialogue',
  IDLE: 'Idle',
  HELO: 'Hello',
  SCEN: 'Scene',
};
function displaySubtitle(subtitle: string) {
  return subtitle.replace(
    /(^| · )([A-Z_]{4})$/i,
    (_match, prefix: string, type: string) => prefix + (topicLabels[type.toUpperCase()] ?? type),
  );
}
export function DialogueEntry({
  projectId,
  questId,
  line,
  subtitle,
  badge,
  onVoiceSaved,
  preferredCharacterId,
  onTextSaved,
  onDeleted,
  onTimingSaved,
}: {
  projectId: number;
  questId: string;
  line: DialogueTimingFields & {
    info: string;
    response: number;
    text: string;
    voices?: VoiceChoice[];
    speaker?: string;
    pendingVoice?: boolean;
    canDelete?: boolean;
    canEdit?: boolean;
  };
  subtitle: string;
  /** Short note shown after the text, such as the range of stages the line plays in. */
  badge?: string;
  onVoiceSaved?: () => void;
  preferredCharacterId?: number;
  onTextSaved?: (text: string) => void;
  onDeleted?: () => void;
  onTimingSaved?: (timing: DialogueTiming) => void;
}) {
  const voices = line.voices ?? [],
    [selected, setSelected] = useState(voices.length === 1 ? '0' : ''),
    [playing, setPlaying] = useState(false),
    [error, setError] = useState(''),
    [text, setText] = useState(line.text),
    [editing, setEditing] = useState(false),
    [draftText, setDraftText] = useState(line.text),
    [savingText, setSavingText] = useState(false),
    [textError, setTextError] = useState(''),
    [deleting, setDeleting] = useState(false),
    [deleteError, setDeleteError] = useState(''),
    audioRef = useRef<HTMLAudioElement | null>(null),
    deleteDialog = useRef<HTMLDialogElement>(null);
  const dialogueUrl = `/api/projects/${projectId}/quests/${encodeURIComponent(questId)}/dialogue/${encodeURIComponent(line.info)}/${line.response}`;
  useEffect(() => {
    setText(line.text);
    setDraftText(line.text);
  }, [line.text]);
  async function saveText() {
    setSavingText(true);
    setTextError('');
    try {
      const response = await fetch(dialogueUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: draftText, expectedText: text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not save dialogue.');
      setText(data.text);
      setEditing(false);
      onTextSaved?.(data.text);
    } catch (e) {
      setTextError(e instanceof Error ? e.message : 'Could not save dialogue.');
    } finally {
      setSavingText(false);
    }
  }
  async function removeDialogue() {
    setDeleting(true);
    setDeleteError('');
    try {
      const response = await fetch(dialogueUrl, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedText: text }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Could not delete dialogue.');
      }
      deleteDialog.current?.close();
      onDeleted?.();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Could not delete dialogue.');
    } finally {
      setDeleting(false);
    }
  }
  useEffect(
    () => () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        if (activeAudio === audio) activeAudio = null;
      }
    },
    [],
  );
  async function toggle() {
    const existing = audioRef.current;
    if (existing && !existing.paused) {
      existing.pause();
      return;
    }
    const choice = voices[Number(selected)];
    if (!choice) return;
    setError('');
    if (activeAudio && activeAudio !== existing) activeAudio.pause();
    const params = new URLSearchParams({ voice: choice.voice, file: choice.file }),
      url = `${dialogueUrl}/audio?${params}`;
    const audio = existing ?? new Audio(url);
    audioRef.current = audio;
    activeAudio = audio;
    audio.onplay = () => setPlaying(true);
    audio.onpause = () => setPlaying(false);
    audio.onended = () => setPlaying(false);
    audio.onerror = () => {
      setPlaying(false);
      setError('Could not play voice audio.');
    };
    try {
      await audio.play();
    } catch {
      setPlaying(false);
      setError('Could not play voice audio.');
    }
  }
  const chosenVoice = voices.length === 1 ? voices[0] : selected ? voices[Number(selected)] : undefined;
  const speakers = chosenVoice?.speakers ?? [];
  function select(value: string) {
    audioRef.current?.pause();
    audioRef.current = null;
    setSelected(value);
    setError('');
  }
  return (
    <article className="dialogue-entry dialogue-with-audio">
      <button
        type="button"
        className="dialogue-play"
        aria-label={playing ? 'Pause voice' : 'Play voice'}
        title={
          !voices.length
            ? 'No WAV voice file found'
            : voices.length > 1 && !selected
              ? 'Choose a voice first'
              : playing
                ? 'Pause'
                : 'Play'
        }
        disabled={!voices.length || (voices.length > 1 && !selected)}
        onClick={() => void toggle()}
      >
        {playing ? (
          <Pause size={14} fill="currentColor" aria-hidden="true" />
        ) : (
          <Play size={14} fill="currentColor" aria-hidden="true" />
        )}
      </button>
      <div className="dialogue-content">
        <p>
          {text || <em>No subtitle</em>}
          {line.pendingVoice && <span className="dialogue-badge">Pending voice approval</span>}
          {badge && <span className="dialogue-badge">{badge}</span>}
        </p>
        <small>
          {displaySubtitle(subtitle)}
          {chosenVoice
            ? speakers.length === 1
              ? ` · Voice: ${speakers[0]}`
              : speakers.length > 1
                ? ` · Shared voice: ${speakers.join(', ')}`
                : ` · Voice type: ${chosenVoice.voice}`
            : voices.length
              ? ' · Choose a voice to identify the speaker'
              : ' · Voice unavailable'}
        </small>
        {voices.length > 1 && (
          <select
            className="dialogue-voice-select"
            aria-label="Voice recording"
            value={selected}
            onChange={(e) => select(e.target.value)}
          >
            <option value="">Choose a voice</option>
            {voices.map((voice, index) => (
              <option value={String(index)} key={`${voice.voice}/${voice.file}`}>
                {voice.speakers?.length === 1 ? voice.speakers[0] : voice.voice}
                {voices.filter((v) => v.voice === voice.voice).length > 1 ? ` · ${voice.file}` : ''}
              </option>
            ))}
          </select>
        )}
        {error && (
          <small className="dialogue-audio-error" role="alert">
            {error}
          </small>
        )}
        {line.canEdit !== false &&
          (!editing ? (
            <button
              type="button"
              className="dialogue-voice-edit dialogue-text-edit"
              onClick={() => {
                setDraftText(text);
                setTextError('');
                setEditing(true);
              }}
            >
              Edit text
            </button>
          ) : (
            <div className="dialogue-text-editor">
              <label>
                Dialogue text
                <textarea
                  aria-label="Dialogue text"
                  maxLength={150}
                  value={draftText}
                  disabled={savingText}
                  onChange={(e) => setDraftText(e.target.value)}
                />
              </label>
              <small>{draftText.length}/150 · English characters only</small>
              {!!voices.length && (
                <p>
                  Existing audio and lipsync will still contain the old line. Regenerate them after changing
                  the text.
                </p>
              )}
              {textError && (
                <p className="error" role="alert">
                  {textError}
                </p>
              )}
              <div>
                <button
                  type="button"
                  className="primary"
                  disabled={savingText || !draftText.trim() || draftText.trim() === text}
                  onClick={() => void saveText()}
                >
                  Save text
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={savingText}
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ))}
        <DialogueTimingEditor
          url={dialogueUrl}
          text={text}
          line={line}
          readOnly={line.canEdit === false || line.canDelete === false}
          onSaved={onTimingSaved}
        />
        {onVoiceSaved && line.canEdit !== false && (
          <ExistingVoiceEditor
            projectId={projectId}
            questId={questId}
            line={{ ...line, text }}
            onSaved={onVoiceSaved}
            preferredCharacterId={preferredCharacterId}
          />
        )}
      </div>
      {line.canDelete && onDeleted && !editing && (
        <>
          <button
            type="button"
            className="dialogue-delete"
            aria-label="Delete dialogue"
            title="Delete dialogue"
            onClick={() => {
              setDeleteError('');
              deleteDialog.current?.showModal();
            }}
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
          <dialog
            ref={deleteDialog}
            className="dialog dialogue-delete-dialog"
            aria-label="Delete dialogue?"
            onCancel={(event) => {
              if (deleting) event.preventDefault();
            }}
          >
            <div className="dialog-head">
              <h2>Delete dialogue?</h2>
            </div>
            <div className="dialog-body">
              <p>“{text}”</p>
              <p>The Anvil will back up the plugin before deleting this line.</p>
              {deleteError && (
                <p className="error" role="alert">
                  {deleteError}
                </p>
              )}
            </div>
            <footer>
              <button
                type="button"
                className="secondary"
                disabled={deleting}
                onClick={() => deleteDialog.current?.close()}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-danger"
                disabled={deleting}
                onClick={() => void removeDialogue()}
              >
                {deleting ? 'Deleting…' : 'Delete dialogue'}
              </button>
            </footer>
          </dialog>
        </>
      )}
    </article>
  );
}
