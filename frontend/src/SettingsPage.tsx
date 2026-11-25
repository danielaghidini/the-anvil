import { useEffect, useState, type FormEvent } from 'react';

type Provider = 'openai' | 'openrouter' | 'anthropic' | 'gemini' | 'custom';
type Saved = { provider: Provider; model: string; endpoint: string; hasKey: boolean };
type Character = { id: number; name: string };
type Voice = { id: string; name: string };
const labels: Record<Provider, string> = {
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  custom: 'Custom OpenAI-compatible',
};
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'The operation failed.');
  return data as T;
}
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
export function SettingsPage({
  projectId,
  characters,
  onAiChanged,
}: {
  projectId: number | null;
  characters: Character[];
  onAiChanged: () => void;
}) {
  const [provider, setProvider] = useState<Provider>('openai'),
    [saved, setSaved] = useState<Partial<Record<Provider, Saved>>>({}),
    [model, setModel] = useState(''),
    [endpoint, setEndpoint] = useState(''),
    [apiKey, setApiKey] = useState('');
  const [elevenKey, setElevenKey] = useState(''),
    [hasEleven, setHasEleven] = useState(false),
    [voices, setVoices] = useState<Voice[] | null>(null),
    [bindings, setBindings] = useState<Record<number, string>>({}),
    [voiceModels, setVoiceModels] = useState<Record<number, string>>({}),
    [savedBindings, setSavedBindings] = useState<Record<number, string>>({}),
    [savedVoiceModels, setSavedVoiceModels] = useState<Record<number, string>>({}),
    [voiceFolders, setVoiceFolders] = useState<Record<number, string>>({}),
    [savedVoiceFolders, setSavedVoiceFolders] = useState<Record<number, string>>({}),
    [availableFolders, setAvailableFolders] = useState<string[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [elevenError, setElevenError] = useState(''),
    [message, setMessage] = useState(''),
    [settingsLoaded, setSettingsLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ providers: Saved[]; selectedProvider: Provider }>('/api/ai-settings'),
      api<{ hasKey: boolean }>('/api/elevenlabs/settings'),
    ])
      .then(([ai, eleven]) => {
        if (!active) return;
        const data: Partial<Record<Provider, Saved>> = {};
        for (const item of ai.providers) data[item.provider] = item;
        setSaved(data);
        const initial = ai.selectedProvider || 'openai';
        setProvider(initial);
        setModel(data[initial]?.model || '');
        setEndpoint(data[initial]?.endpoint || '');
        setHasEleven(eleven.hasKey);
        setSettingsLoaded(true);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setBindings({});
    setVoiceModels({});
    setSavedBindings({});
    setSavedVoiceModels({});
    setVoiceFolders({});
    setSavedVoiceFolders({});
    setAvailableFolders([]);
    if (projectId !== null)
      api<{
        voices: { characterId: number; voiceId: string; modelId: string }[];
        folders: { characterId: number; voiceFolder: string }[];
      }>(`/api/projects/${projectId}/synthetic-voices`)
        .then((data) => {
          if (active) {
            const nextBindings = Object.fromEntries(data.voices.map((v) => [v.characterId, v.voiceId]));
            const nextModels = Object.fromEntries(data.voices.map((v) => [v.characterId, v.modelId]));
            const nextFolders = Object.fromEntries(data.folders.map((v) => [v.characterId, v.voiceFolder]));
            setBindings(nextBindings);
            setVoiceModels(nextModels);
            setSavedBindings(nextBindings);
            setSavedVoiceModels(nextModels);
            setVoiceFolders(nextFolders);
            setSavedVoiceFolders(nextFolders);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    if (projectId !== null)
      api<{ folders: string[] }>(`/api/projects/${projectId}/voice-drafts/options`)
        .then((data) => {
          if (active) setAvailableFolders(data.folders);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [projectId]);
  useEffect(() => {
    if (!hasEleven) return;
    let active = true;
    api<{ voices: Voice[] }>('/api/elevenlabs/voices')
      .then((result) => {
        if (active) setVoices(result.voices);
      })
      .catch(() => {
        if (active) setElevenError('Could not load voice names. Use Load voices to try again.');
      });
    return () => {
      active = false;
    };
  }, [hasEleven]);
  function selectProvider(next: Provider) {
    setProvider(next);
    setModel(saved[next]?.model || '');
    setEndpoint(saved[next]?.endpoint || '');
    setApiKey('');
    setError('');
    setMessage('');
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The operation failed.');
    } finally {
      setBusy(false);
    }
  }
  function saveAi(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const result = await api<Saved>(
        `/api/ai-settings/${provider}`,
        json('PUT', {
          model: model.trim(),
          endpoint: provider === 'custom' ? endpoint.trim() : '',
          ...(apiKey.trim() ? { key: apiKey.trim() } : {}),
        }),
      );
      setSaved((current) => ({ ...current, [provider]: result }));
      setApiKey('');
      setMessage('Assistant settings saved.');
      onAiChanged();
    });
  }
  function removeAi() {
    void run(async () => {
      await api(`/api/ai-settings/${provider}`, { method: 'DELETE' });
      setSaved((current) => {
        const next = { ...current };
        delete next[provider];
        return next;
      });
      setApiKey('');
      setMessage('Assistant key removed.');
      onAiChanged();
    });
  }
  function saveEleven(e: FormEvent) {
    e.preventDefault();
    setElevenError('');
    void run(async () => {
      await api('/api/elevenlabs/settings', json('PUT', { key: elevenKey.trim() }));
      setElevenKey('');
      setHasEleven(true);
      setVoices(null);
      setMessage('ElevenLabs key saved. Load voices to verify the connection.');
    });
  }
  function removeEleven() {
    setElevenError('');
    void run(async () => {
      await api('/api/elevenlabs/settings', { method: 'DELETE' });
      setHasEleven(false);
      setVoices(null);
      setElevenKey('');
      setMessage('ElevenLabs key removed. Character voice selections remain saved.');
    });
  }
  function loadVoices() {
    setElevenError('');
    void run(async () => {
      try {
        const result = await api<{ voices: Voice[] }>('/api/elevenlabs/voices');
        setVoices(result.voices);
        setMessage(`Connected to ElevenLabs. ${result.voices.length} voices loaded.`);
      } catch (e) {
        setVoices(null);
        setElevenError(e instanceof Error ? e.message : 'Could not load voices.');
      }
    });
  }
  function saveCharacterVoice(characterId: number) {
    if (projectId === null) return;
    const voiceId = bindings[characterId] || '';
    const modelId = voiceModels[characterId] || 'eleven_multilingual_v2';
    const voiceFolder = voiceFolders[characterId] || '';
    void run(async () => {
      await api(
        `/api/projects/${projectId}/characters/${characterId}/synthetic-voice`,
        json('PUT', { voiceId, modelId, voiceFolder }),
      );
      setSavedBindings((current) => ({ ...current, [characterId]: voiceId }));
      setSavedVoiceModels((current) => ({
        ...current,
        [characterId]: voiceId ? modelId : 'eleven_multilingual_v2',
      }));
      setSavedVoiceFolders((current) => ({ ...current, [characterId]: voiceFolder }));
      setMessage('Character voice settings saved.');
    });
  }
  return (
    <div className="settings-page">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="settings-status" role="status">
          {message}
        </p>
      )}
      <section className="panel settings-card">
        <h2>Assistant</h2>
        <p>Configure the API key and model for each provider.</p>
        <form onSubmit={saveAi}>
          <label>
            Provider
            <select value={provider} onChange={(e) => selectProvider(e.target.value as Provider)}>
              {Object.entries(labels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {settingsLoaded && (
            <div className="settings-key-state" role="status">
              <span className={`settings-key-badge ${saved[provider] ? 'is-configured' : 'is-missing'}`}>
                {saved[provider] ? 'API key saved' : 'API key not configured'}
              </span>
              <span>
                {saved[provider]
                  ? 'A key is saved for this provider. Its connection has not been verified.'
                  : 'Add an API key and model to configure this provider.'}
              </span>
            </div>
          )}
          <label>
            API key
            <input
              type="password"
              autoComplete="off"
              maxLength={500}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={saved[provider] ? 'Key saved · enter a new key to replace' : 'Enter your API key'}
            />
          </label>
          <label>
            Model
            <input
              required
              maxLength={120}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Model ID"
            />
          </label>
          {provider === 'custom' && (
            <label>
              Chat completions endpoint
              <input
                required
                type="url"
                maxLength={1000}
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://provider.example/v1/chat/completions"
              />
            </label>
          )}
          <p className="muted">
            Keys are protected by your Windows account. Project context is sent to the selected provider.
          </p>
          <div className="settings-actions">
            {saved[provider] && (
              <button type="button" className="settings-remove" disabled={busy} onClick={removeAi}>
                Remove key
              </button>
            )}
            <button
              className="primary"
              disabled={busy || !model.trim() || (!apiKey.trim() && !saved[provider])}
            >
              Save
            </button>
          </div>
        </form>
      </section>
      <section className="panel settings-card">
        <h2>ElevenLabs</h2>
        <p>Connect an account and assign a synthetic voice to characters that use one.</p>
        <div className="settings-permissions">
          <strong>API key permissions</strong>
          <p>
            <b>Voices → Read</b> is required to load your voices.
          </p>
          <p>
            <b>Text to Speech</b> is required to generate voice audio.
          </p>
        </div>
        {settingsLoaded && (
          <div className="settings-key-state" role="status">
            <span className={`settings-key-badge ${hasEleven ? 'is-configured' : 'is-missing'}`}>
              {hasEleven
                ? voices !== null
                  ? 'Connection verified'
                  : 'API key saved'
                : 'API key not configured'}
            </span>
            <span>
              {hasEleven
                ? voices !== null
                  ? 'ElevenLabs voices loaded successfully.'
                  : 'A key is saved. Load voices to verify the connection.'
                : 'Add an API key to configure ElevenLabs.'}
            </span>
          </div>
        )}
        <form onSubmit={saveEleven}>
          <label>
            ElevenLabs API key
            <input
              type="password"
              autoComplete="off"
              maxLength={500}
              value={elevenKey}
              onChange={(e) => setElevenKey(e.target.value)}
              placeholder={hasEleven ? 'Key saved · enter a new key to replace' : 'Enter your API key'}
            />
          </label>
          <p className="muted">
            The key is protected by your Windows account. Loading voices contacts ElevenLabs.
          </p>
          <div className="settings-actions">
            {hasEleven && (
              <button type="button" className="settings-remove" disabled={busy} onClick={removeEleven}>
                Remove key
              </button>
            )}
            <button type="submit" className="secondary" disabled={busy || !elevenKey.trim()}>
              Save key
            </button>
            <button type="button" className="primary" disabled={busy || !hasEleven} onClick={loadVoices}>
              Load voices
            </button>
          </div>
          {elevenError && (
            <p className="error" role="alert">
              {elevenError}
            </p>
          )}
        </form>
        <div className="settings-voices">
          <h3>Character voices</h3>
          <p>Choose a voice and model, then save each character's settings.</p>
          {projectId === null ? (
            <p>Select a project to assign voices.</p>
          ) : !characters.length ? (
            <p>Add a character to assign a voice.</p>
          ) : (
            <>
              <p>
                {voices === null
                  ? 'Load voices to choose one for a character. Existing selections are shown below.'
                  : 'Choose a voice for each character that has a synthetic voice.'}
              </p>
              {characters.map((character) => {
                const current = bindings[character.id] || '';
                const currentModel = voiceModels[character.id] || 'eleven_multilingual_v2';
                const currentFolder = voiceFolders[character.id] || '';
                const dirty =
                  current !== (savedBindings[character.id] || '') ||
                  (current &&
                    currentModel !== (savedVoiceModels[character.id] || 'eleven_multilingual_v2')) ||
                  currentFolder !== (savedVoiceFolders[character.id] || '');
                return (
                  <div key={character.id}>
                    <label>
                      {character.name}
                      <select
                        value={current}
                        disabled={busy || voices === null}
                        onChange={(e) => {
                          const value = e.target.value;
                          setBindings((current) => ({ ...current, [character.id]: value }));
                        }}
                      >
                        <option value="">No synthetic voice</option>
                        {current && !voices?.some((v) => v.id === current) && (
                          <option value={current}>
                            {voices === null
                              ? 'Loading saved voice…'
                              : 'Saved voice unavailable in ElevenLabs'}
                          </option>
                        )}
                        {voices?.map((voice) => (
                          <option key={voice.id} value={voice.id}>
                            {voice.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Default voice folder · {character.name}
                      <select
                        value={currentFolder}
                        disabled={busy}
                        onChange={(e) => {
                          const value = e.target.value;
                          setVoiceFolders((current) => ({ ...current, [character.id]: value }));
                        }}
                      >
                        <option value="">Choose when saving audio</option>
                        {currentFolder && !availableFolders.includes(currentFolder) && (
                          <option value={currentFolder}>{currentFolder} (not found)</option>
                        )}
                        {availableFolders.map((folder) => (
                          <option key={folder} value={folder}>
                            {folder}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Model · {character.name}
                      <select
                        value={currentModel}
                        disabled={busy || !current}
                        onChange={(e) => {
                          const value = e.target.value;
                          setVoiceModels((current) => ({ ...current, [character.id]: value }));
                        }}
                      >
                        <option value="eleven_multilingual_v2">Eleven Multilingual v2</option>
                        <option value="eleven_v3">Eleven v3</option>
                        <option value="eleven_v4">Eleven v4</option>
                      </select>
                    </label>
                    <div className="character-voice-save">
                      <button
                        type="button"
                        className="primary"
                        disabled={busy || !dirty}
                        onClick={() => saveCharacterVoice(character.id)}
                      >
                        Save
                      </button>
                      {!dirty && (!!savedBindings[character.id] || !!savedVoiceFolders[character.id]) && (
                        <span role="status">Saved</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
