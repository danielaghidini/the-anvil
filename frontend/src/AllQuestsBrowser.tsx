import { AddIdleDialog } from './AddIdleDialog';
import type { DialogueTiming, DialogueTimingFields } from '../../shared/dialogue-timing';
import { DialogueCategories } from './DialogueCategories';
import { QuestDialogueList } from './QuestDialogueList';
import { dialogueForQuest, type DialogueView } from '../../shared/dialogue-categories';
import { RepeatedLine, stageAnchor, stageRanges } from './stageRanges';
import { DialogueEntry, type VoiceChoice } from './DialogueEntry';
import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { CatalogQuest, PluginQuest } from '../../shared/types';
import type { StageCondition } from '../../shared/stage-match';
import {
  filterStageDialogues,
  groupStageDialogues,
  filterStagesByVoice,
  objectiveStageMap,
  type VoiceFilter,
} from '../../shared/skyrim-dialogue';
import { AssignmentSelect, label } from './QuestDashboard';
import { QuestCoverage } from './QuestCoverage';
import { StageObjectives } from './StageObjectives';
import { StageIgnoreToggle, gameStageKey, pluginStageKey, useIgnoredStages } from './ignoredStages';

type Line = DialogueTimingFields & {
  info: string;
  response: number;
  text: string;
  topicType: string;
  topicCategory?: number;
  topicEditorId?: string;
  speaker?: string;
  pendingVoice?: boolean;
  canDelete?: boolean;
  voices?: VoiceChoice[];
  conditions: StageCondition[];
  modQuest?: string;
};
type Links = {
  groups: { questId: string; gameGroup: string }[];
  games: { questId: string; gameId: string; gamePlugin: string }[];
};
type Detail = { stages: number[]; formId: string | null; objectiveTexts?: Record<string, string> };
type GameResult = { detail: Detail | null; lines: Line[]; error?: string };
type PluginResult = { lines: Line[]; error?: string };
type Props =
  | {
      projectId: number;
      kind: 'skyrim';
      quests: CatalogQuest[];
      pluginQuests: PluginQuest[];
      links: Links;
      initialStatus?: string;
    }
  | { projectId: number; kind: 'plugin'; quests: PluginQuest[] };
async function get<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Could not load data');
  return response.json() as Promise<T>;
}
const gameKey = (q: CatalogQuest) => `${q.plugin}|${q.id}`;
export function AllQuestsBrowser(props: Props) {
  const [dialogueView, setDialogueView] = useState<DialogueView>('stages');
  const [voiceRevision, setVoiceRevision] = useState(0);
  const [adding, setAdding] = useState<{ quest: PluginQuest; stage: number } | null>(null),
    [saveRefreshError, setSaveRefreshError] = useState('');
  const [query, setQuery] = useState(''),
    [stage, setStage] = useState(''),
    [status, setStatus] = useState(
      props.kind === 'skyrim' ? (props.initialStatus ?? 'objectives') : 'objectives',
    ),
    [voiceFilter, setVoiceFilter] = useState<VoiceFilter>(''),
    [gameResults, setGameResults] = useState<Record<string, GameResult>>({}),
    [pluginResults, setPluginResults] = useState<Record<string, PluginResult>>({}),
    [loaded, setLoaded] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setGameResults({});
    setPluginResults({});
    setLoaded(0);
    let next = 0;
    async function load() {
      if (props.kind === 'plugin') {
        const quests = props.quests;
        async function worker() {
          while (next < quests.length && !abort.signal.aborted) {
            const q = quests[next++];
            try {
              const data = await get<{ lines: Line[] }>(
                `/api/projects/${props.projectId}/quests/${encodeURIComponent(q.id)}/dialogue`,
                abort.signal,
              );
              if (!abort.signal.aborted)
                setPluginResults((current) => ({ ...current, [q.id]: { lines: data.lines } }));
            } catch {
              if (!abort.signal.aborted)
                setPluginResults((current) => ({
                  ...current,
                  [q.id]: { lines: [], error: 'Could not load dialogue.' },
                }));
            }
            if (!abort.signal.aborted) setLoaded((n) => n + 1);
          }
        }
        await Promise.all(Array.from({ length: Math.min(3, quests.length) }, worker));
        return;
      }
      const { links, quests, pluginQuests } = props;
      const linkedIds = new Set([
          ...links.groups.map((x) => x.questId),
          ...links.games.map((x) => x.questId),
        ]),
        sources = pluginQuests.filter((q) => linkedIds.has(q.id)),
        dialogues: Record<string, Line[] | null> = {};
      async function loadLines() {
        while (next < sources.length && !abort.signal.aborted) {
          const q = sources[next++];
          try {
            const data = await get<{ lines: Line[] }>(
              `/api/projects/${props.projectId}/quests/${encodeURIComponent(q.id)}/dialogue`,
              abort.signal,
            );
            dialogues[q.id] = data.lines.map((line) => ({ ...line, modQuest: q.id }));
          } catch {
            dialogues[q.id] = null;
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, sources.length) }, loadLines));
      if (abort.signal.aborted) return;
      next = 0;
      async function loadQuest() {
        while (next < quests.length && !abort.signal.aborted) {
          const q = quests[next++],
            related = new Set([
              ...links.groups.filter((x) => x.gameGroup === q.group).map((x) => x.questId),
              ...links.games
                .filter(
                  (x) =>
                    x.gameId.toLowerCase() === q.id.toLowerCase() &&
                    x.gamePlugin.toLowerCase() === q.plugin.toLowerCase(),
                )
                .map((x) => x.questId),
            ]),
            lineSources = sources.filter((x) => related.has(x.id));
          try {
            if (lineSources.some((x) => dialogues[x.id] === null)) throw new Error('Dialogue unavailable');
            const params = new URLSearchParams({ gameId: q.id, gamePlugin: q.plugin }),
              data = await get<{ resolved: Detail | null }>(
                `/api/projects/${props.projectId}/game-quest?${params}`,
                abort.signal,
              );
            if (!abort.signal.aborted)
              setGameResults((current) => ({
                ...current,
                [gameKey(q)]: {
                  detail: data.resolved,
                  lines: lineSources.flatMap((x) => dialogues[x.id] ?? []),
                },
              }));
          } catch {
            if (!abort.signal.aborted)
              setGameResults((current) => ({
                ...current,
                [gameKey(q)]: { detail: null, lines: [], error: 'Could not load quest stages or dialogue.' },
              }));
          }
          if (!abort.signal.aborted) setLoaded((n) => n + 1);
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, quests.length) }, loadQuest));
    }
    void load();
    return () => abort.abort();
  }, [
    props.projectId,
    props.kind,
    props.quests,
    props.kind === 'skyrim' ? props.links : null,
    props.kind === 'skyrim' ? props.pluginQuests : null,
  ]);
  const entries = useMemo(
    () =>
      props.quests.map((q) => {
        if (props.kind === 'skyrim') {
          const game = q as CatalogQuest,
            result = gameResults[gameKey(game)],
            objectives = objectiveStageMap(game.stages),
            detail = result?.detail,
            stages = detail
              ? detail.formId
                ? groupStageDialogues(detail.stages, detail.formId, result.lines)
                : detail.stages.map((number) => ({ number, lines: [] as Line[] }))
              : [];
          return {
            id: gameKey(game),
            stageKey: gameStageKey(game.plugin, game.id),
            title: game.name || game.id,
            group: label(game.group),
            lines: dialogueForQuest(result?.lines ?? [], detail?.formId),
            stages,
            objectives,
            texts: detail?.objectiveTexts,
            ready: !!result,
            error:
              result?.error ??
              (result && !detail
                ? 'Quest stages unavailable.'
                : detail && !detail.formId
                  ? 'Dialogue matching is unavailable.'
                  : undefined),
            canMatch: !!detail?.formId,
            objectivesKnown: true,
          };
        }
        const mod = q as PluginQuest,
          result = pluginResults[mod.id],
          objectives = new Map(
            Object.entries(mod.stageObjectives ?? {}).map(([number, values]) => [Number(number), values]),
          );
        return {
          id: mod.id,
          stageKey: pluginStageKey(mod.id),
          title: mod.name || mod.id,
          group: '',
          lines: result?.lines ?? [],
          stages: result && !result.error ? groupStageDialogues(mod.stages, mod.formId, result.lines) : [],
          objectives,
          texts: mod.objectiveTexts,
          ready: !!result,
          error: result?.error,
          canMatch: !!result && !result.error,
          objectivesKnown: mod.objectiveStages !== undefined,
        };
      }),
    [props.kind, props.quests, gameResults, pluginResults],
  );
  const options = useMemo(
    () =>
      [
        ...new Set(
          entries.flatMap((entry) =>
            filterStageDialogues(entry.stages, '', status, '', new Set(entry.objectives.keys())).map(
              (x) => x.number,
            ),
          ),
        ),
      ].sort((a, b) => a - b),
    [entries, status],
  );
  const ignoredStages = useIgnoredStages(props.projectId);
  function removeLine(questId: string, line: Line) {
    const remaining = (items: Line[]) =>
      items.filter((item) => item.info !== line.info || item.response !== line.response);
    if (props.kind === 'plugin') {
      setPluginResults((current) => {
        const result = current[questId];
        return result ? { ...current, [questId]: { ...result, lines: remaining(result.lines) } } : current;
      });
    } else {
      setGameResults((current) =>
        Object.fromEntries(
          Object.entries(current).map(([key, result]) => [
            key,
            { ...result, lines: remaining(result.lines) },
          ]),
        ),
      );
    }
  }
  async function reloadVoice(owner: string, info: string, response: number) {
    try {
      setSaveRefreshError('');
      const data = await get<{ lines: Line[] }>(
        `/api/projects/${props.projectId}/quests/${encodeURIComponent(owner)}/dialogue`,
        new AbortController().signal,
      );
      const approved = data.lines.find((item) => item.info === info && item.response === response);
      if (!approved) throw Error('Saved dialogue not found.');
      if (props.kind === 'plugin') {
        setPluginResults((current) => ({ ...current, [owner]: { lines: data.lines } }));
        setVoiceRevision((value) => value + 1);
        return;
      }
      setGameResults((current) =>
        Object.fromEntries(
          Object.entries(current).map(([key, result]) => [
            key,
            {
              ...result,
              lines: result.lines.map((item) =>
                item.modQuest === owner && item.info === info && item.response === response
                  ? { ...approved, modQuest: owner }
                  : item,
              ),
            },
          ]),
        ),
      );
      setVoiceRevision((value) => value + 1);
    } catch {
      setSaveRefreshError('Voice saved. Reload to refresh the dialogue.');
    }
  }
  const allStages = entries
    .filter((e) => e.canMatch)
    .flatMap((e) => e.stages.map((s) => ({ ...s, ignored: ignoredStages.isIgnored(e.stageKey, s.number) })));
  function updateTiming(owner: string, line: Line, timing: DialogueTiming) {
    const update = (items: Line[]) =>
      items.map((item) =>
        item.info === line.info && item.modQuest === line.modQuest ? { ...item, ...timing } : item,
      );
    if (props.kind === 'plugin')
      setPluginResults((current) => {
        const result = current[owner];
        return result ? { ...current, [owner]: { ...result, lines: update(result.lines) } } : current;
      });
    else
      setGameResults((current) =>
        Object.fromEntries(
          Object.entries(current).map(([key, result]) => [key, { ...result, lines: update(result.lines) }]),
        ),
      );
  }
  const categoryCounts = [
    ...new Map(
      entries
        .flatMap((entry) => entry.lines)
        .map((line) => [`${line.modQuest ?? ''}|${line.info}|${line.response}`, line]),
    ).values(),
  ];
  function updateText(owner: string, line: Line, text: string) {
    const update = (items: Line[]) =>
      items.map((item) =>
        item.info === line.info && item.response === line.response && item.modQuest === line.modQuest
          ? { ...item, text }
          : item,
      );
    if (props.kind === 'plugin')
      setPluginResults((current) => {
        const result = current[owner];
        return result ? { ...current, [owner]: { ...result, lines: update(result.lines) } } : current;
      });
    else
      setGameResults((current) =>
        Object.fromEntries(
          Object.entries(current).map(([key, result]) => [key, { ...result, lines: update(result.lines) }]),
        ),
      );
  }
  return (
    <>
      <DialogueCategories
        lines={categoryCounts}
        stageLabel={entries.some((entry) => entry.stages.length > 0) ? 'Stages' : 'All'}
        value={dialogueView}
        onChange={(value) => {
          setDialogueView(value);
          setStage('');
        }}
      />
      <div className="skyrim-toolbar">
        <label className="search">
          <Search size={20} strokeWidth={1.6} aria-hidden="true" />
          <input
            aria-label="Search dialogue in all quests"
            placeholder="Search dialogue"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {dialogueView === 'stages' && (
          <div className="skyrim-stage-picker">
            <AssignmentSelect
              value={stage}
              placeholder="All stages"
              disabled={!options.length}
              options={options.map((n) => ({ value: String(n), label: `Stage ${n}` }))}
              onChange={setStage}
            />
          </div>
        )}
        {dialogueView === 'stages' && (
          <div className="skyrim-status-picker">
            <AssignmentSelect
              value={status}
              placeholder="All statuses"
              placeholderLast
              disabled={false}
              options={[
                { value: 'objectives', label: 'Stages with objectives' },
                { value: 'missing', label: 'No direct dialogue' },
                { value: 'present', label: 'Has direct dialogue' },
                ...(props.kind === 'skyrim' ? [{ value: 'review', label: 'Pending voice approval' }] : []),
                { value: 'most', label: 'Most dialogues first' },
                { value: 'fewest', label: 'Fewest dialogues first' },
              ]}
              onChange={(value) => {
                setStatus(value);
                setStage('');
              }}
            />
          </div>
        )}
        <div className="skyrim-status-picker">
          <AssignmentSelect
            value={voiceFilter}
            placeholder="All voices"
            disabled={false}
            options={[
              { value: 'no-voice', label: 'Voice unavailable' },
              { value: 'with-voice', label: 'Has voice' },
            ]}
            onChange={(value) => setVoiceFilter(value as VoiceFilter)}
          />
        </div>
      </div>
      {dialogueView === 'stages' && (
        <QuestCoverage stages={allStages} isIgnored={(s) => (s as { ignored?: boolean }).ignored === true} />
      )}
      {ignoredStages.error && (
        <p className="error" role="alert">
          {ignoredStages.error}
        </p>
      )}
      <p className="skyrim-results-caption">
        {props.quests.length} quests ·{' '}
        {loaded < props.quests.length ? `Loading ${loaded} of ${props.quests.length}…` : 'All quests loaded'}
      </p>
      {dialogueView === 'stages' && (
        <p className="skyrim-match-hint">
          Direct stage conditions only. Quest and objective data load as they become available.
        </p>
      )}
      <div className="all-quest-list">
        {entries.map((entry) => {
          const visible = filterStagesByVoice(
            filterStageDialogues(entry.stages, stage, status, query, new Set(entry.objectives.keys())),
            voiceFilter,
          );
          if (dialogueView === 'stages' && status === 'review' && !visible.length) return null;
          const ranges = stageRanges(entry.stages, visible);
          return (
            <section className="all-quest" key={entry.id}>
              <h3>
                {entry.title}
                {entry.group && <small>{entry.group}</small>}
              </h3>
              {!entry.ready ? (
                <p className="muted">Loading quest…</p>
              ) : entry.error ? (
                <p className="info">{entry.error}</p>
              ) : dialogueView !== 'stages' ? (
                <QuestDialogueList
                  key={`${entry.id}|${dialogueView}|${voiceRevision}`}
                  projectId={props.projectId}
                  questId={entry.id}
                  lines={entry.lines}
                  category={dialogueView}
                  query={query}
                  voiceFilter={voiceFilter}
                  onTextSaved={(line, text) => updateText(line.modQuest ?? entry.id, line, text)}
                  onDeleted={(line) => removeLine(line.modQuest ?? entry.id, line)}
                  onTimingSaved={(line, timing) => updateTiming(line.modQuest ?? entry.id, line, timing)}
                  onVoiceSaved={(line) =>
                    void reloadVoice(line.modQuest ?? entry.id, line.info, line.response)
                  }
                />
              ) : status === 'objectives' && !entry.objectivesKnown ? (
                <p className="muted">Objective links unavailable for this quest.</p>
              ) : !entry.stages.length ? (
                <p className="muted">No stages found for this quest.</p>
              ) : !visible.length ? (
                <p className="muted">No stages match the current filters.</p>
              ) : (
                <div className="skyrim-stage-list">
                  {visible.map((item) => (
                    <section
                      className={`panel skyrim-stage ${ignoredStages.isIgnored(entry.stageKey, item.number) ? 'is-ignored' : ''}`}
                      key={item.number}
                      id={stageAnchor(entry.id, item.number)}
                    >
                      <div className="skyrim-stage-heading">
                        <strong>Stage {item.number}</strong>
                        <div className="stage-actions">
                          {entry.canMatch && (
                            <StageIgnoreToggle
                              ignored={ignoredStages.isIgnored(entry.stageKey, item.number)}
                              stages={ignoredStages}
                              questKey={entry.stageKey}
                              stage={item.number}
                            />
                          )}
                          <span>
                            {item.lines.length
                              ? `${item.lines.length} ${item.lines.length === 1 ? 'dialogue' : 'dialogues'}`
                              : 'No direct dialogue'}
                          </span>
                          {props.kind === 'plugin' && (
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => {
                                const quest = props.quests.find((q) => q.id === entry.id);
                                if (quest) {
                                  setSaveRefreshError('');
                                  setAdding({ quest, stage: item.number });
                                }
                              }}
                            >
                              + Add dialogue
                            </button>
                          )}
                        </div>
                      </div>
                      <StageObjectives numbers={entry.objectives.get(item.number)} texts={entry.texts} />
                      {item.lines.map((line) => {
                        const shown = ranges.shownIn(line, item.number);
                        return shown !== undefined ? (
                          <RepeatedLine
                            key={`${line.modQuest ?? ''}|${line.info}|${line.response}`}
                            text={line.text}
                            label={ranges.label(line)}
                            stage={shown}
                            scope={entry.id}
                          />
                        ) : (
                          <DialogueEntry
                            key={`${line.modQuest ?? ''}|${line.info}|${line.response}`}
                            projectId={props.projectId}
                            questId={line.modQuest ?? entry.id}
                            line={line}
                            onDeleted={() => removeLine(line.modQuest ?? entry.id, line)}
                            onTimingSaved={(timing) => updateTiming(line.modQuest ?? entry.id, line, timing)}
                            onVoiceSaved={
                              line.modQuest
                                ? () => void reloadVoice(line.modQuest!, line.info, line.response)
                                : undefined
                            }
                            onTextSaved={(text) => {
                              const update = (items: Line[]) =>
                                items.map((item) =>
                                  item.info === line.info &&
                                  item.response === line.response &&
                                  item.modQuest === line.modQuest
                                    ? { ...item, text }
                                    : item,
                                );
                              if (props.kind === 'plugin')
                                setPluginResults((current) => {
                                  const result = current[entry.id];
                                  return result
                                    ? { ...current, [entry.id]: { ...result, lines: update(result.lines) } }
                                    : current;
                                });
                              else
                                setGameResults((current) =>
                                  Object.fromEntries(
                                    Object.entries(current).map(([key, result]) => [
                                      key,
                                      { ...result, lines: update(result.lines) },
                                    ]),
                                  ),
                                );
                            }}
                            subtitle={`${line.modQuest ? `${line.modQuest} · ` : ''}${line.topicType}`}
                            badge={ranges.label(line)}
                          />
                        );
                      })}
                    </section>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
      {saveRefreshError && (
        <p className="error" role="alert">
          {saveRefreshError}
        </p>
      )}
      {adding && (
        <AddIdleDialog
          projectId={props.projectId}
          stage={adding.stage}
          questLabel={adding.quest.id}
          stages={adding.quest.stages}
          destinations={[adding.quest]}
          onClose={() => setAdding(null)}
          onSaved={(quest) => {
            void get<{ lines: Line[] }>(
              `/api/projects/${props.projectId}/quests/${encodeURIComponent(quest)}/dialogue`,
              new AbortController().signal,
            )
              .then((result) =>
                setPluginResults((current) => ({ ...current, [quest]: { lines: result.lines } })),
              )
              .catch(() =>
                setSaveRefreshError(
                  'The dialogue was saved, but the list could not be refreshed. Reload the page; do not save it again.',
                ),
              );
          }}
        />
      )}
    </>
  );
}
