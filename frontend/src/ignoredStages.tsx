import { useCallback, useEffect, useMemo, useState } from 'react';

type IgnoredStage = { questKey: string; stage: number };
export const gameStageKey = (plugin: string, id: string) =>
  `game:${plugin.toLowerCase()}|${id.toLowerCase()}`;
export const pluginStageKey = (id: string) => `plugin:${id.toLowerCase()}`;
const entry = (questKey: string, stage: number) => `${questKey.toLowerCase()}#${stage}`;

export function useIgnoredStages(projectId: number) {
  const [items, setItems] = useState<IgnoredStage[] | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    setItems(null);
    setError('');
    fetch(`/api/projects/${projectId}/ignored-stages`, { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Request failed');
        const data = (await response.json()) as { stages: IgnoredStage[] };
        setItems(data.stages);
      })
      .catch(() => {
        if (!abort.signal.aborted) setError('Could not load ignored stages.');
      });
    return () => abort.abort();
  }, [projectId]);
  const set = useMemo(() => new Set((items ?? []).map((x) => entry(x.questKey, x.stage))), [items]);
  const isIgnored = useCallback((questKey: string, stage: number) => set.has(entry(questKey, stage)), [set]);
  const ignoredFor = useCallback(
    (questKey: string) => {
      const prefix = `${questKey.toLowerCase()}#`;
      return new Set([...set].filter((x) => x.startsWith(prefix)).map((x) => Number(x.slice(prefix.length))));
    },
    [set],
  );
  async function setIgnored(questKey: string, stage: number, ignored: boolean) {
    setPending(true);
    setError('');
    try {
      const response = await fetch(`/api/projects/${projectId}/ignored-stages`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questKey, stage, ignored }),
      });
      if (!response.ok) throw new Error('Request failed');
      const data = (await response.json()) as { stages: IgnoredStage[] };
      setItems(data.stages);
    } catch {
      setError('Could not update ignored stage. Try again.');
    } finally {
      setPending(false);
    }
  }
  return { loaded: items !== null, pending, error, isIgnored, ignoredFor, setIgnored };
}
export type IgnoredStages = ReturnType<typeof useIgnoredStages>;

export function StageIgnoreToggle({
  ignored,
  stages,
  questKey,
  stage,
}: {
  ignored: boolean;
  stages: IgnoredStages;
  questKey: string;
  stage: number;
}) {
  return (
    <label className="progress-ignore" title="Exclude this stage from completion percentages">
      <input
        type="checkbox"
        checked={ignored}
        disabled={!stages.loaded || stages.pending}
        onChange={(e) => void stages.setIgnored(questKey, stage, e.target.checked)}
      />
      <span>Ignore</span>
    </label>
  );
}
