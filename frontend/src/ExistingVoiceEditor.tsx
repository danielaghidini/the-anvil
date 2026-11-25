import { useEffect, useRef, useState } from 'react';
import { Upload, Sparkles, X, ChevronDown } from 'lucide-react';
import { AudioPreview } from './AudioPreview';

type Options = {
  folders: string[];
  folderCharacters: {
    id: number;
    name: string;
    modelId: string;
    npcFormIds: string[];
    defaultFolder: string;
    hasVoice: boolean;
  }[];
  speakers: { formId: string; voiceType: string }[];
  hasKey: boolean;
  voiceDirectory: string;
};
function VoiceSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [query, setQuery] = useState('');
  const shown = options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <details
      ref={ref}
      className="assignment-picker voice-select"
      onToggle={(e) => {
        if (!e.currentTarget.open) setQuery('');
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) e.currentTarget.open = false;
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && ref.current) {
          ref.current.open = false;
          ref.current.querySelector('summary')?.focus();
        }
      }}
    >
      <summary
        aria-label={label}
        aria-disabled={disabled}
        onClick={(e) => {
          if (disabled) e.preventDefault();
        }}
      >
        <span>{options.find((item) => item.value === value)?.label ?? label}</span>
        <ChevronDown size={17} aria-hidden="true" />
      </summary>
      <div className="assignment-options">
        {options.length > 8 && (
          <input
            aria-label={`Search ${label.toLowerCase()}`}
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        {!query && (
          <button
            type="button"
            className={!value ? 'selected' : ''}
            onClick={() => {
              onChange('');
              if (ref.current) ref.current.open = false;
            }}
          >
            {label}
          </button>
        )}
        {shown.map((item) => (
          <button
            type="button"
            key={item.value}
            className={item.value === value ? 'selected' : ''}
            aria-current={item.value === value ? 'true' : undefined}
            onClick={() => {
              onChange(item.value);
              if (ref.current) ref.current.open = false;
            }}
          >
            {item.label}
          </button>
        ))}
        {!shown.length && <p className="voice-select-empty">No results found.</p>}
      </div>
    </details>
  );
}
export function ExistingVoiceEditor({
  projectId,
  questId,
  line,
  onSaved,
  preferredCharacterId,
}: {
  projectId: number;
  questId: string;
  line: {
    info: string;
    response: number;
    text: string;
    speaker?: string;
    pendingVoice?: boolean;
    voices?: { voice: string; file: string }[];
  };
  onSaved: () => void;
  preferredCharacterId?: number;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [options, setOptions] = useState<Options | null>(null),
    [folder, setFolder] = useState(''),
    [voiceIndex, setVoiceIndex] = useState(line.voices?.length === 1 ? '0' : ''),
    [character, setCharacter] = useState(''),
    [showAllFolders, setShowAllFolders] = useState(false),
    [draft, setDraft] = useState(''),
    [lip, setLip] = useState(false),
    [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(`/api/projects/${projectId}/voice-drafts/options`, { signal: controller.signal })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message);
        return data as Options;
      })
      .then((data) => {
        setOptions(data);
        const preferred =
          data.folderCharacters.find((item) => item.npcFormIds.includes(line.speaker ?? '')) ??
          data.folderCharacters.find((item) => item.id === preferredCharacterId);
        setCharacter(preferred ? String(preferred.id) : '');
        if (!line.voices?.length) setFolder('');
        if (preferred) {
          if (!line.voices?.length) {
            const speaker =
              data.speakers.find((item) => item.formId === line.speaker) ??
              data.speakers.find((item) => preferred.npcFormIds.includes(item.formId));
            const matchingFolder = data.folders.find(
              (item) =>
                item.toLowerCase() === (preferred.defaultFolder || speaker?.voiceType || '').toLowerCase(),
            );
            if (matchingFolder) setFolder(matchingFolder);
            else if (data.folders.length === 1) setFolder(data.folders[0]);
          }
        } else if (!line.voices?.length && data.folders.length === 1) setFolder(data.folders[0]);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [open, projectId, preferredCharacterId, line.speaker]);
  const linkedNpcIds = new Set(
    options?.folderCharacters.find((item) => String(item.id) === character)?.npcFormIds ?? [],
  );
  const linkedVoiceTypes = new Set(
    options?.speakers
      .filter((item) => linkedNpcIds.has(item.formId))
      .map((item) => item.voiceType.toLowerCase()) ?? [],
  );
  const selectedDefault = options?.folderCharacters.find(
    (item) => String(item.id) === character,
  )?.defaultFolder;
  const suggestedFolders =
    options?.folders.filter(
      (item) =>
        linkedVoiceTypes.has(item.toLowerCase()) || item.toLowerCase() === selectedDefault?.toLowerCase(),
    ) ?? [];
  const shownFolders =
    showAllFolders || !suggestedFolders.length ? (options?.folders ?? []) : suggestedFolders;
  const targetVoice = line.voices?.length && voiceIndex !== '' ? line.voices[Number(voiceIndex)] : undefined;
  const targetFolder = targetVoice?.voice || (!line.voices?.length ? folder : '');
  async function post(url: string, body: object) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || 'Could not prepare voice.');
    return data;
  }
  async function prepare(file?: File) {
    setBusy(file ? 'Loading WAV…' : 'Generating audio…');
    setError('');
    try {
      let wav: string | undefined;
      if (file) {
        if (file.size > 12000000) throw new Error('WAV file must be at most 12 MB.');
        wav = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () => reject(new Error('Could not read WAV.'));
          reader.readAsDataURL(file);
        });
      }
      const data = await post(`/api/projects/${projectId}/voice-drafts`, {
        text: line.text,
        slot: `line:${line.info.toLowerCase()}:${line.response}`,
        ...(wav ? { wav } : { characterId: Number(character) }),
      });
      setDraft(data.draft);
      setLip(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not prepare voice.');
    } finally {
      setBusy('');
    }
  }
  async function makeLip() {
    setBusy('Generating lipsync…');
    setError('');
    try {
      await post(`/api/projects/${projectId}/voice-drafts/${draft}/lip`, { text: line.text });
      setLip(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate lipsync.');
    } finally {
      setBusy('');
    }
  }
  async function save() {
    setBusy('Saving…');
    setError('');
    try {
      await post(
        `/api/projects/${projectId}/quests/${encodeURIComponent(questId)}/dialogue/${encodeURIComponent(line.info)}/${line.response}/voice`,
        line.voices?.length
          ? {
              draft,
              voiceFolder: line.voices[Number(voiceIndex)].voice,
              existingFile: line.voices[Number(voiceIndex)].file,
            }
          : { draft, voiceFolder: folder },
      );
      setDraft('');
      setLip(false);
      setOpen(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save voice.');
    } finally {
      setBusy('');
    }
  }
  if (!open)
    return (
      <button type="button" className="dialogue-voice-edit" onClick={() => setOpen(true)}>
        {line.pendingVoice ? 'Review voice' : line.voices?.length ? 'Redo voice' : 'Add voice'}
      </button>
    );
  return (
    <section className="existing-voice-editor">
      <div className="voice-editor-header">
        <div>
          <strong>{line.pendingVoice ? 'Review voice' : line.voices?.length ? 'Redo voice' : 'Add voice'}</strong>
          <p>Generate with ElevenLabs or import a WAV recording.</p>
        </div>
        <button
          type="button"
          className="voice-editor-close"
          aria-label="Close voice editor"
          disabled={!!busy}
          onClick={() => setOpen(false)}
        >
          <X size={17} />
        </button>
      </div>
      <div className="voice-editor-fields">
        {line.voices?.length ? (
          <div className="voice-editor-field">
            <span>Voice to replace</span>
            <VoiceSelect
              label="Choose a voice"
              value={voiceIndex}
              disabled={!!busy}
              onChange={setVoiceIndex}
              options={line.voices.map((voice, index) => ({
                value: String(index),
                label: `${voice.voice} · ${voice.file}`,
              }))}
            />
          </div>
        ) : (
          <div>
            <div className="voice-editor-field">
              <span>Voice folder</span>
              <VoiceSelect
                label="Choose a folder"
                value={folder}
                onChange={setFolder}
                disabled={!!busy}
                options={shownFolders.map((f) => ({ value: f, label: f }))}
              />
            </div>
            {suggestedFolders.length > 0 && !showAllFolders && (
              <button type="button" className="dialogue-voice-edit" onClick={() => setShowAllFolders(true)}>
                Show other folders
              </button>
            )}
          </div>
        )}
        <div className="voice-editor-field">
          <span>ElevenLabs character</span>
          <VoiceSelect
            label="Choose a character"
            value={character}
            onChange={(value) => {
              setCharacter(value);
              if (!line.voices?.length) {
                const npcIds =
                  options?.folderCharacters.find((item) => String(item.id) === value)?.npcFormIds ?? [];
                const configured = options?.folderCharacters.find(
                  (item) => String(item.id) === value,
                )?.defaultFolder;
                const speaker = options?.speakers.find((item) => npcIds.includes(item.formId));
                setFolder(
                  options?.folders.find(
                    (item) => item.toLowerCase() === (configured || speaker?.voiceType || '').toLowerCase(),
                  ) ?? '',
                );
                setShowAllFolders(false);
              }
            }}
            disabled={!!busy}
            options={(options?.folderCharacters ?? []).map((c) => ({
              value: String(c.id),
              label: `${c.name} · ${
                c.hasVoice
                  ? c.modelId === 'eleven_v4'
                    ? 'Eleven v4'
                    : c.modelId === 'eleven_v3'
                      ? 'Eleven v3'
                      : 'Multilingual v2'
                  : 'No AI voice'
              }`,
            }))}
          />
        </div>
      </div>
      {options && (!options.hasKey || !options.folderCharacters.some((c) => c.hasVoice)) && (
        <p>
          Configure an ElevenLabs API key and assign a voice to a character in Settings to generate audio.
        </p>
      )}
      {options && (
        <div className="voice-editor-destination">
          <strong>Save location</strong>
          <span>
            {options.voiceDirectory}
            {targetFolder ? `\\${targetFolder}` : '\\[choose a voice folder]'}
            {targetVoice ? `\\${targetVoice.file}` : ''}
          </span>
        </div>
      )}
      <div className="voice-editor-actions">
        <input
          ref={fileInput}
          hidden
          type="file"
          accept=".wav,audio/wav,audio/x-wav"
          disabled={!!busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void prepare(file);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className="secondary"
          disabled={
            !!busy ||
            !options?.hasKey ||
            !options.folderCharacters.some((c) => String(c.id) === character && c.hasVoice)
          }
          onClick={() => void prepare()}
        >
          <Sparkles size={15} /> Generate with AI
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!!busy}
          onClick={() => fileInput.current?.click()}
        >
          <Upload size={15} /> Load WAV
        </button>
      </div>
      {draft && (
        <div className="voice-editor-preview">
          <span>Audio preview</span>
          <AudioPreview key={draft} compact src={`/api/projects/${projectId}/voice-drafts/${draft}/audio`} />
          <button
            type="button"
            className="secondary"
            disabled={!!busy || !draft}
            onClick={() => void makeLip()}
          >
            Generate lipsync
          </button>
        </div>
      )}
      {lip && <p role="status">WAV and lipsync ready to save.</p>}
      {busy && <p role="status">{busy}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="voice-editor-footer">
        <button
          type="button"
          className="primary"
          disabled={!!busy || !lip || (line.voices?.length ? !voiceIndex : !folder)}
          onClick={() => void save()}
        >
          {line.pendingVoice ? 'Approve and save voice' : line.voices?.length ? 'Replace voice' : 'Save voice'}
        </button>
      </div>
    </section>
  );
}
