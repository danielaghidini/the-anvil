import { AddIdleDialog } from './AddIdleDialog';
import type { DialogueTiming, DialogueTimingFields } from '../../shared/dialogue-timing';
import { DialogueCategories } from './DialogueCategories';
import { QuestDialogueList } from './QuestDialogueList';
import { dialogueForQuest, type DialogueView } from '../../shared/dialogue-categories';
import { RepeatedLine, stageAnchor, stageRanges } from './stageRanges';
import { DialogueEntry, type VoiceChoice } from './DialogueEntry';
import { AllQuestsBrowser } from './AllQuestsBrowser';
import { StageObjectives } from './StageObjectives';
import { QuestCoverage } from './QuestCoverage';
import {
  IgnoreStagesWithoutObjectives,
  StageIgnoreToggle,
  gameStageKey,
  useIgnoredStages,
} from './ignoredStages';
import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { CatalogQuest, PluginQuest } from '../../shared/types';
import type { StageCondition } from '../../shared/stage-match';
import {
  groupStageDialogues,
  filterStageDialogues,
  filterStagesByVoice,
  objectiveStageMap,
  type VoiceFilter,
} from '../../shared/skyrim-dialogue';
import { AssignmentSelect, label, sortGroups } from './QuestDashboard';

type Links = {
  groups: { questId: string; gameGroup: string }[];
  games: { questId: string; gameId: string; gamePlugin: string }[];
};
type Catalog = { groups: string[]; quests: CatalogQuest[] };
type Dialogue = DialogueTimingFields & {
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
};
type GameDetail = {
  quest: CatalogQuest;
  resolved: {
    id: string;
    plugin: string;
    stages: number[];
    formId: string | null;
    objectiveTexts?: Record<string, string>;
  } | null;
};
type Line = Dialogue & { modQuest: string };
const all = '__all__';
const questKey = (q: CatalogQuest) => `${q.plugin}|${q.id}`;
async function get<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Could not load quest data.');
  return data as T;
}
export function SkyrimQuestBrowser({
  projectId,
  quests,
  initialQuest,
  onQuestContext,
  onOpenSetup,
}: {
  projectId: number;
  quests: PluginQuest[];
  initialQuest?: { questId: string; group: string; plugin?: string };
  onQuestContext: (quest: CatalogQuest | null) => void;
  onOpenSetup: () => void;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [links, setLinks] = useState<Links | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [group, setGroup] = useState(initialQuest?.group ?? ''),
    [questId, setQuestId] = useState(initialQuest ? `${initialQuest.plugin}|${initialQuest.questId}` : ''),
    [stage, setStage] = useState(''),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState('objectives'),
    [voiceFilter, setVoiceFilter] = useState<VoiceFilter>('');
  const [addingStage, setAddingStage] = useState<number | null>(null);
  const [dialogueView, setDialogueView] = useState<DialogueView>('stages');
  const [voiceRevision, setVoiceRevision] = useState(0);
  const [game, setGame] = useState<GameDetail | null>(null),
    [lines, setLines] = useState<Line[]>([]),
    [detailLoading, setDetailLoading] = useState(false),
    [detailError, setDetailError] = useState('');
  useEffect(() => () => onQuestContext(null), [onQuestContext]);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError('');
    Promise.all([
      get<Catalog>('/api/catalog', abort.signal),
      get<Links>(`/api/projects/${projectId}/quest-links`, abort.signal),
    ])
      .then(([c, l]) => {
        setCatalog(c);
        setLinks(l);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load quests.');
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [projectId]);
  const groups = useMemo(() => {
    if (!catalog || !links) return [];
    const included = new Set(links.groups.map((x) => x.gameGroup));
    for (const link of links.games) {
      const q = catalog.quests.find(
        (x) =>
          x.id.toLowerCase() === link.gameId.toLowerCase() &&
          x.plugin.toLowerCase() === link.gamePlugin.toLowerCase(),
      );
      if (q) included.add(q.group);
    }
    return sortGroups(catalog.groups.filter((g) => included.has(g)));
  }, [catalog, links]);
  const gameQuests = useMemo(() => {
    if (!catalog || !links || !group) return [];
    return catalog.quests.filter(
      (q) =>
        (group === all || q.group === group) &&
        (links.groups.some((x) => x.gameGroup === q.group) ||
          links.games.some(
            (g) =>
              g.gameId.toLowerCase() === q.id.toLowerCase() &&
              g.gamePlugin.toLowerCase() === q.plugin.toLowerCase(),
          )),
    );
  }, [catalog, links, group]);
  const showingAll = group === all || questId === all;
  const chosenQuest = showingAll ? undefined : gameQuests.find((q) => questKey(q) === questId);
  useEffect(() => {
    if (!catalog || !links) return;
    if (groups.length && group !== all && !groups.includes(group)) setGroup(groups[0]);
    else if (!groups.length) setGroup('');
  }, [groups, group, catalog, links]);
  useEffect(() => {
    if (!catalog || !links || showingAll) return;
    if (gameQuests.length && !gameQuests.some((q) => questKey(q) === questId)) {
      const preferred =
        group === 'Principal' ? gameQuests.find((q) => q.id.toLowerCase() === 'mq102') : undefined;
      setQuestId(questKey(preferred ?? gameQuests[0]));
    } else if (!gameQuests.length) setQuestId('');
  }, [gameQuests, questId, group, catalog, links, showingAll]);
  useEffect(() => {
    setStage('');
    setQuery('');
    setStatus('objectives');
    setVoiceFilter('');
    setGame(null);
    setLines([]);
    setDetailError('');
    if (!chosenQuest || !links) {
      setDetailLoading(false);
      onQuestContext(null);
      return;
    }
    const abort = new AbortController();
    setDetailLoading(true);
    onQuestContext(chosenQuest);
    const related = new Set([
      ...links.groups.filter((g) => g.gameGroup === chosenQuest.group).map((g) => g.questId),
      ...links.games
        .filter(
          (g) =>
            g.gameId.toLowerCase() === chosenQuest.id.toLowerCase() &&
            g.gamePlugin.toLowerCase() === chosenQuest.plugin.toLowerCase(),
        )
        .map((g) => g.questId),
    ]);
    const modQuests = quests.filter((q) => related.has(q.id));
    const params = new URLSearchParams({ gameId: chosenQuest.id, gamePlugin: chosenQuest.plugin });
    Promise.all([
      get<GameDetail>(`/api/projects/${projectId}/game-quest?${params}`, abort.signal),
      ...modQuests.map(async (q) => ({
        quest: q.id,
        result: await get<{ lines: Dialogue[] }>(
          `/api/projects/${projectId}/quests/${encodeURIComponent(q.id)}/dialogue`,
          abort.signal,
        ),
      })),
    ])
      .then(([detail, ...dialogues]) => {
        setGame(detail);
        setLines(dialogues.flatMap((d) => d.result.lines.map((line) => ({ ...line, modQuest: d.quest }))));
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          setDetailError(e instanceof Error ? e.message : 'Could not load quest details.');
      })
      .finally(() => {
        if (!abort.signal.aborted) setDetailLoading(false);
      });
    return () => abort.abort();
  }, [projectId, chosenQuest, group, links, quests, onQuestContext]);
  const destinations =
    chosenQuest && links
      ? quests.filter(
          (q) =>
            links.groups.some((x) => x.questId === q.id && x.gameGroup === chosenQuest.group) ||
            links.games.some(
              (x) =>
                x.questId === q.id &&
                x.gameId.toLowerCase() === chosenQuest.id.toLowerCase() &&
                x.gamePlugin.toLowerCase() === chosenQuest.plugin.toLowerCase(),
            ),
        )
      : [];
  async function reloadDialogue(destination: string) {
    try {
      const updated = await get<{ lines: Dialogue[] }>(
        `/api/projects/${projectId}/quests/${encodeURIComponent(destination)}/dialogue`,
        new AbortController().signal,
      );
      setLines((current) => [
        ...current.filter((line) => line.modQuest !== destination),
        ...updated.lines.map((line) => ({ ...line, modQuest: destination })),
      ]);
      setVoiceRevision((value) => value + 1);
    } catch {
      setDetailError(
        'The dialogue was saved, but the list could not be refreshed. Reload the page; do not save it again.',
      );
    }
  }
  const stages = useMemo(() => {
    const resolved = game?.resolved;
    if (!resolved) return [];
    return resolved.formId
      ? groupStageDialogues(resolved.stages, resolved.formId, lines)
      : [...resolved.stages].sort((a, b) => a - b).map((number) => ({ number, lines: [] as Line[] }));
  }, [game, lines]);
  const ignoredStages = useIgnoredStages(projectId);
  const objectives = useMemo(() => objectiveStageMap(chosenQuest?.stages ?? []), [chosenQuest]);
  const objectiveStages = useMemo(() => new Set(objectives.keys()), [objectives]);
  const stageOptions = filterStageDialogues(stages, '', status, '', objectiveStages);
  const visible = filterStagesByVoice(
    filterStageDialogues(stages, stage, status, query, objectiveStages),
    voiceFilter,
  );
  const ranges = stageRanges(stages, visible);
  function updateTiming(line: Line, timing: DialogueTiming) {
    setLines((current) =>
      current.map((item) =>
        item.modQuest === line.modQuest && item.info === line.info ? { ...item, ...timing } : item,
      ),
    );
  }
  const questLines = dialogueForQuest(lines, game?.resolved?.formId);
  if (loading) return <p className="muted">Loading quests…</p>;
  if (error)
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  if (!groups.length)
    return (
      <div className="empty quest-list-empty">
        <p>No Skyrim quest groups are linked yet.</p>
        <button type="button" className="secondary" onClick={onOpenSetup}>
          Open Quests Setup
        </button>
      </div>
    );
  return (
    <div className="skyrim-browser">
      <div className="skyrim-selectors">
        <AssignmentSelect
          value={group}
          placeholder="Choose a Skyrim quest group"
          disabled={detailLoading}
          options={[
            { value: all, label: 'All quest groups' },
            ...groups.map((g) => ({ value: g, label: label(g) })),
          ]}
          onChange={(value) => {
            setGroup(value);
            setQuestId((previous) => (previous === all || value === all ? all : ''));
          }}
        />
        <AssignmentSelect
          value={group === all ? all : questId}
          placeholder="Choose a Skyrim quest"
          disabled={group === all || !gameQuests.length}
          options={[
            { value: all, label: 'All quests' },
            ...gameQuests.map((q) => ({ value: questKey(q), label: q.name || q.id })),
          ]}
          onChange={setQuestId}
        />
      </div>
      {showingAll && links ? (
        <AllQuestsBrowser
          projectId={projectId}
          kind="skyrim"
          quests={gameQuests}
          pluginQuests={quests}
          links={links}
          initialStatus={status}
        />
      ) : null}
      {chosenQuest && (
        <>
          <DialogueCategories
            lines={questLines}
            value={dialogueView}
            disabled={detailLoading}
            onChange={(value) => {
              setDialogueView(value);
              setStage('');
            }}
          />
          <div className="skyrim-toolbar">
            <label className="search">
              <Search size={20} strokeWidth={1.6} aria-hidden="true" />
              <input
                aria-label={
                  dialogueView === 'stages' ? 'Search dialogue in selected stages' : 'Search dialogue'
                }
                placeholder="Search dialogue"
                disabled={!chosenQuest || detailLoading || !game?.resolved?.formId}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {dialogueView === 'stages' && (
              <div className="skyrim-stage-picker">
                <AssignmentSelect
                  value={stage}
                  placeholder="All stages"
                  disabled={!game?.resolved || detailLoading}
                  options={stageOptions.map((x) => ({ value: String(x.number), label: `Stage ${x.number}` }))}
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
                  disabled={!game?.resolved || detailLoading}
                  options={[
                    { value: 'objectives', label: 'Stages with objectives' },
                    ...(game?.resolved?.formId
                      ? [
                          { value: 'missing', label: 'No direct dialogue' },
                          { value: 'present', label: 'Has direct dialogue' },
                          { value: 'review', label: 'Pending voice approval' },
                          { value: 'most', label: 'Most dialogues first' },
                          { value: 'fewest', label: 'Fewest dialogues first' },
                        ]
                      : []),
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
                disabled={detailLoading || !game?.resolved?.formId}
                options={[
                  { value: 'no-voice', label: 'Voice unavailable' },
                  { value: 'with-voice', label: 'Has voice' },
                ]}
                onChange={(value) => setVoiceFilter(value as VoiceFilter)}
              />
            </div>
          </div>
          {dialogueView === 'stages' && !detailLoading && !detailError && game?.resolved?.formId && (
            <QuestCoverage
              stages={stages}
              isIgnored={(s) =>
                ignoredStages.isIgnored(gameStageKey(chosenQuest.plugin, chosenQuest.id), s.number)
              }
            />
          )}
          {ignoredStages.error && (
            <p className="error" role="alert">
              {ignoredStages.error}
            </p>
          )}
          {detailLoading ? (
            <p className="muted">Loading quest stages…</p>
          ) : detailError ? (
            <p className="error" role="alert">
              {detailError}
            </p>
          ) : !game?.resolved ? (
            <p className="info">Quest stages could not be read from the installed game files.</p>
          ) : dialogueView !== 'stages' ? (
            <QuestDialogueList
              key={`${questId}|${dialogueView}|${voiceRevision}`}
              projectId={projectId}
              questId={chosenQuest.id}
              lines={questLines}
              category={dialogueView}
              onTimingSaved={updateTiming}
              query={query}
              voiceFilter={voiceFilter}
              onTextSaved={(line, text) =>
                setLines((current) =>
                  current.map((item) =>
                    item.modQuest === line.modQuest &&
                    item.info === line.info &&
                    item.response === line.response
                      ? { ...item, text }
                      : item,
                  ),
                )
              }
              onDeleted={(line) =>
                setLines((current) =>
                  current.filter(
                    (item) =>
                      item.modQuest !== line.modQuest ||
                      item.info !== line.info ||
                      item.response !== line.response,
                  ),
                )
              }
              onVoiceSaved={(line) => void reloadDialogue(line.modQuest)}
            />
          ) : !stages.length ? (
            <p className="empty">No stages found for this quest.</p>
          ) : (
            <>
              <div className="stage-results-row">
                <p className="skyrim-results-caption">
                  {chosenQuest.name || chosenQuest.id} · {visible.length}{' '}
                  {visible.length === 1 ? 'stage' : 'stages'}
                </p>
                {objectiveStages.size > 0 && (
                  <IgnoreStagesWithoutObjectives
                    stages={ignoredStages}
                    questKey={gameStageKey(chosenQuest.plugin, chosenQuest.id)}
                    stageNumbers={stages.map((s) => s.number)}
                    objectiveStages={objectiveStages}
                  />
                )}
              </div>
              {game.resolved.formId ? (
                <p className="skyrim-match-hint" title="Other dialogue conditions may also apply.">
                  {status === 'objectives' ? 'Catalog objective links · ' : ''}Direct stage conditions only.
                </p>
              ) : (
                <p className="info">
                  Dialogue matching is unavailable because the quest owner is not a master of this plugin.
                </p>
              )}
              <div className="skyrim-stage-list">
                {visible.map((item) => (
                  <section
                    className={`panel skyrim-stage ${ignoredStages.isIgnored(gameStageKey(chosenQuest.plugin, chosenQuest.id), item.number) ? 'is-ignored' : ''}`}
                    key={item.number}
                    id={stageAnchor('quest', item.number)}
                  >
                    <div className="skyrim-stage-heading">
                      <div>
                        <strong>Stage {item.number}</strong>
                      </div>
                      <div className="stage-actions">
                        <StageIgnoreToggle
                          ignored={ignoredStages.isIgnored(
                            gameStageKey(chosenQuest.plugin, chosenQuest.id),
                            item.number,
                          )}
                          stages={ignoredStages}
                          questKey={gameStageKey(chosenQuest.plugin, chosenQuest.id)}
                          stage={item.number}
                        />
                        <span>
                          {!game?.resolved?.formId
                            ? 'Not analyzed'
                            : item.lines.length
                              ? `${item.lines.length} ${item.lines.length === 1 ? 'dialogue' : 'dialogues'}`
                              : 'No direct dialogue'}
                        </span>
                        <button
                          type="button"
                          className="secondary"
                          disabled={!game?.resolved?.formId || !destinations.length}
                          onClick={() => setAddingStage(item.number)}
                        >
                          + Add dialogue
                        </button>
                      </div>
                    </div>
                    <StageObjectives
                      numbers={objectives.get(item.number)}
                      texts={game.resolved?.objectiveTexts}
                    />
                    {item.lines.map((line) => {
                      const shown = ranges.shownIn(line, item.number);
                      return shown !== undefined ? (
                        <RepeatedLine
                          key={`${line.modQuest}|${line.info}|${line.response}`}
                          text={line.text}
                          label={ranges.label(line)}
                          stage={shown}
                          scope="quest"
                        />
                      ) : (
                        <DialogueEntry
                          key={`${line.modQuest}|${line.info}|${line.response}`}
                          projectId={projectId}
                          questId={line.modQuest}
                          line={line}
                          onVoiceSaved={() => void reloadDialogue(line.modQuest)}
                          onTimingSaved={(timing) => updateTiming(line, timing)}
                          onDeleted={() =>
                            setLines((current) =>
                              current.filter(
                                (item) => item.info !== line.info || item.response !== line.response,
                              ),
                            )
                          }
                          onTextSaved={(text) =>
                            setLines((current) =>
                              current.map((item) =>
                                item.modQuest === line.modQuest &&
                                item.info === line.info &&
                                item.response === line.response
                                  ? { ...item, text }
                                  : item,
                              ),
                            )
                          }
                          subtitle={`${line.modQuest}${line.topicType ? ` · ${line.topicType}` : ''}`}
                          badge={ranges.label(line)}
                        />
                      );
                    })}
                  </section>
                ))}
                {!visible.length && (
                  <p className="empty">
                    {status === 'objectives' && !stageOptions.length
                      ? 'No objective-linked stages are available in the catalog for this quest. Choose All statuses to see every stage.'
                      : 'No stages match the current filters.'}
                  </p>
                )}
              </div>
            </>
          )}
        </>
      )}
      {addingStage !== null && chosenQuest && (
        <AddIdleDialog
          projectId={projectId}
          stage={addingStage}
          questLabel={chosenQuest.id}
          stages={game?.resolved?.stages ?? []}
          destinations={destinations}
          game={{ id: chosenQuest.id, plugin: chosenQuest.plugin }}
          onClose={() => setAddingStage(null)}
          onSaved={(destination) => void reloadDialogue(destination)}
        />
      )}
    </div>
  );
}
