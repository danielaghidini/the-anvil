import { AddIdleDialog } from './AddIdleDialog';
import type { DialogueTiming, DialogueTimingFields } from '../../shared/dialogue-timing';
import { DialogueCategories } from './DialogueCategories';
import { QuestDialogueList } from './QuestDialogueList';
import type { DialogueView } from '../../shared/dialogue-categories';
import { RepeatedLine, stageAnchor, stageRanges } from './stageRanges';
import { DialogueEntry, type VoiceChoice } from './DialogueEntry';
import { AllQuestsBrowser } from './AllQuestsBrowser';
import { StageObjectives } from './StageObjectives';
import { QuestCoverage } from './QuestCoverage';
import {
  IgnoreStagesWithoutObjectives,
  StageIgnoreToggle,
  pluginStageKey,
  useIgnoredStages,
} from './ignoredStages';
import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { PluginQuest } from '../../shared/types';
import type { StageCondition } from '../../shared/stage-match';
import {
  filterStageDialogues,
  groupStageDialogues,
  filterStagesByVoice,
  matchesVoiceFilter,
  type VoiceFilter,
} from '../../shared/skyrim-dialogue';
import { AssignmentSelect } from './QuestDashboard';

type Links = { characters: { questId: string; characterId: number }[] };
type Character = { id: number; name: string };
type Dialogue = DialogueTimingFields & {
  info: string;
  response: number;
  text: string;
  topicType: string;
  topicCategory?: number;
  topicEditorId?: string;
  canDelete?: boolean;
  voices?: VoiceChoice[];
  conditions: StageCondition[];
};
async function get<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Could not load quest data.');
  return data as T;
}
export function NpcQuestBrowser({
  projectId,
  quests,
  characters,
  initialQuest,
  onQuestContext,
  onRemoveCharacter,
  onOpenSetup,
}: {
  projectId: number;
  quests: PluginQuest[];
  initialQuest?: { questId: string; group: string };
  /** Reports the quest shown here so the assistant can use it as context. */
  onQuestContext?: (questId: string | null) => void;
  characters: Character[];
  onRemoveCharacter: (id: number) => void;
  onOpenSetup: () => void;
}) {
  const [links, setLinks] = useState<Links | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [group, setGroup] = useState(initialQuest?.group ?? ''),
    [questId, setQuestId] = useState(initialQuest?.questId ?? ''),
    [stage, setStage] = useState(''),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState(''),
    [voiceFilter, setVoiceFilter] = useState<VoiceFilter>('');
  const [addingStage, setAddingStage] = useState<number | null>(null);
  const [dialogueView, setDialogueView] = useState<DialogueView>('stages');
  const [voiceRevision, setVoiceRevision] = useState(0);
  const [lines, setLines] = useState<Dialogue[]>([]),
    [detailLoading, setDetailLoading] = useState(false),
    [detailError, setDetailError] = useState('');
  function removeLine(line: Dialogue) {
    setLines((current) =>
      current.filter((item) => item.info !== line.info || item.response !== line.response),
    );
  }
  function updateText(line: Dialogue, text: string) {
    setLines((current) =>
      current.map((item) =>
        item.info === line.info && item.response === line.response ? { ...item, text } : item,
      ),
    );
  }
  function updateTiming(line: Dialogue, timing: DialogueTiming) {
    setLines((current) => current.map((item) => (item.info === line.info ? { ...item, ...timing } : item)));
  }
  async function reloadDialogue() {
    if (!chosenQuest) return;
    try {
      const data = await get<{ lines: Dialogue[] }>(
        `/api/projects/${projectId}/quests/${encodeURIComponent(chosenQuest.id)}/dialogue`,
        new AbortController().signal,
      );
      setLines(data.lines);
      setVoiceRevision((value) => value + 1);
    } catch {
      setDetailError('Voice saved, but the list could not be refreshed. Reload the page.');
    }
  }
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError('');
    get<Links>(`/api/projects/${projectId}/quest-links`, abort.signal)
      .then(setLinks)
      .catch((e) => {
        if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load quests.');
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [projectId]);
  const groups = characters;
  const groupQuests = useMemo(
    () =>
      quests.filter((q) =>
        links?.characters.some(
          (x) => x.questId === q.id && (group === '__all__' || String(x.characterId) === group),
        ),
      ),
    [quests, links, group],
  );
  const chosenQuest = group === '__all__' ? undefined : groupQuests.find((q) => q.id === questId);
  useEffect(() => {
    onQuestContext?.(chosenQuest?.id ?? null);
    return () => onQuestContext?.(null);
  }, [chosenQuest?.id, onQuestContext]);
  useEffect(() => {
    if (!links) return;
    if (groups.length && group !== '__all__' && !groups.some((c) => String(c.id) === group))
      setGroup(String(groups[0].id));
    else if (!groups.length) setGroup('');
  }, [groups, group, links]);
  useEffect(() => {
    if (!links) return;
    if (groupQuests.length && !groupQuests.some((q) => q.id === questId)) setQuestId(groupQuests[0].id);
    else if (!groupQuests.length) setQuestId('');
  }, [groupQuests, questId, links]);
  useEffect(() => {
    setStage('');
    setQuery('');
    setVoiceFilter('');
    setStatus(chosenQuest?.stages.length && chosenQuest.objectiveStages !== undefined ? 'objectives' : '');
    setLines([]);
    setDetailError('');
    if (!chosenQuest) {
      setDetailLoading(false);
      return;
    }
    const abort = new AbortController();
    setDetailLoading(true);
    get<{ lines: Dialogue[] }>(
      `/api/projects/${projectId}/quests/${encodeURIComponent(chosenQuest.id)}/dialogue`,
      abort.signal,
    )
      .then((d) => setLines(d.lines))
      .catch((e) => {
        if (!abort.signal.aborted)
          setDetailError(e instanceof Error ? e.message : 'Could not load dialogue.');
      })
      .finally(() => {
        if (!abort.signal.aborted) setDetailLoading(false);
      });
    return () => abort.abort();
  }, [projectId, chosenQuest]);
  const stages = useMemo(
    () => (chosenQuest ? groupStageDialogues(chosenQuest.stages, chosenQuest.formId, lines) : []),
    [chosenQuest, lines],
  );
  const ignoredStages = useIgnoredStages(projectId);
  const objectiveStages = new Set(chosenQuest?.objectiveStages ?? []);
  const stageOptions = filterStageDialogues(stages, '', status, '', objectiveStages);
  const visible = filterStagesByVoice(
    filterStageDialogues(stages, stage, status, query, objectiveStages),
    voiceFilter,
  );
  const ranges = stageRanges(stages, visible);
  const unstageLines = lines.filter(
    (line) =>
      line.text.toLowerCase().includes(query.trim().toLowerCase()) && matchesVoiceFilter(line, voiceFilter),
  );
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
        <p>No characters have been added yet.</p>
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
          placeholder="Choose a character"
          disabled={detailLoading}
          options={[
            { value: '__all__', label: 'All characters' },
            ...groups.map((c) => ({ value: String(c.id), label: c.name })),
          ]}
          onChange={(value) => {
            setGroup(value);
            setQuestId('');
          }}
          onRemoveCharacter={
            group && group !== '__all__' ? () => onRemoveCharacter(Number(group)) : undefined
          }
        />
        <AssignmentSelect
          value={group === '__all__' ? '' : questId}
          placeholder={group === '__all__' ? 'All quests' : 'Choose an NPC quest'}
          disabled={group === '__all__' || !groupQuests.length}
          options={groupQuests.map((q) => ({ value: q.id, label: q.name || q.id }))}
          onChange={setQuestId}
        />
      </div>
      {!groupQuests.length && (
        <div className="empty quest-list-empty">
          <p>
            {group === '__all__'
              ? 'No quests are linked to characters yet.'
              : 'No quests are linked to this character yet.'}
          </p>
          <button type="button" className="secondary" onClick={onOpenSetup}>
            Open Quests Setup
          </button>
        </div>
      )}
      {group === '__all__' && groupQuests.length > 0 ? (
        <AllQuestsBrowser projectId={projectId} kind="plugin" quests={groupQuests} />
      ) : null}
      {chosenQuest && (
        <>
          <DialogueCategories
            lines={lines}
            stageLabel={chosenQuest.stages.length ? 'Stages' : 'All'}
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
                  dialogueView === 'stages' && chosenQuest.stages.length
                    ? 'Search dialogue in selected stages'
                    : 'Search dialogue'
                }
                placeholder="Search dialogue"
                disabled={detailLoading}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {dialogueView === 'stages' && chosenQuest.stages.length > 0 && (
              <div className="skyrim-stage-picker">
                <AssignmentSelect
                  value={stage}
                  placeholder="All stages"
                  disabled={detailLoading}
                  options={stageOptions.map((x) => ({ value: String(x.number), label: `Stage ${x.number}` }))}
                  onChange={setStage}
                />
              </div>
            )}
            {dialogueView === 'stages' && chosenQuest.stages.length > 0 && (
              <div className="skyrim-status-picker">
                <AssignmentSelect
                  value={status}
                  placeholder="All statuses"
                  placeholderLast
                  disabled={detailLoading}
                  options={[
                    ...(chosenQuest.objectiveStages !== undefined
                      ? [{ value: 'objectives', label: 'Stages with objectives' }]
                      : []),
                    { value: 'missing', label: 'No direct dialogue' },
                    { value: 'present', label: 'Has direct dialogue' },
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
                disabled={detailLoading}
                options={[
                  { value: 'no-voice', label: 'Voice unavailable' },
                  { value: 'with-voice', label: 'Has voice' },
                ]}
                onChange={(value) => setVoiceFilter(value as VoiceFilter)}
              />
            </div>
          </div>
          {dialogueView === 'stages' && !detailLoading && !detailError && (
            <QuestCoverage
              stages={stages}
              isIgnored={(s) => ignoredStages.isIgnored(pluginStageKey(chosenQuest.id), s.number)}
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
          ) : dialogueView !== 'stages' ? (
            <QuestDialogueList
              key={`${chosenQuest.id}|${dialogueView}|${voiceRevision}`}
              projectId={projectId}
              questId={chosenQuest.id}
              lines={lines}
              category={dialogueView}
              query={query}
              voiceFilter={voiceFilter}
              onTextSaved={updateText}
              onDeleted={removeLine}
              onTimingSaved={updateTiming}
              onVoiceSaved={() => void reloadDialogue()}
              preferredCharacterId={group && group !== '__all__' ? Number(group) : undefined}
            />
          ) : !stages.length ? (
            <>
              <p className="skyrim-results-caption">{chosenQuest.id} · Dialogue without stages</p>
              <div className="panel skyrim-stage">
                {unstageLines.map((line) => (
                  <DialogueEntry
                    key={`${line.info}|${line.response}|${voiceRevision}`}
                    projectId={projectId}
                    questId={chosenQuest.id}
                    line={line}
                    onDeleted={() => removeLine(line)}
                    onTimingSaved={(timing) => updateTiming(line, timing)}
                    onTextSaved={(text) =>
                      setLines((current) =>
                        current.map((item) =>
                          item.info === line.info && item.response === line.response
                            ? { ...item, text }
                            : item,
                        ),
                      )
                    }
                    subtitle={line.topicType}
                    preferredCharacterId={group && group !== '__all__' ? Number(group) : undefined}
                    onVoiceSaved={() => {
                      void get<{ lines: Dialogue[] }>(
                        `/api/projects/${projectId}/quests/${encodeURIComponent(chosenQuest.id)}/dialogue`,
                        new AbortController().signal,
                      )
                        .then((result) => {
                          setLines(result.lines);
                          setVoiceRevision((value) => value + 1);
                        })
                        .catch(() =>
                          setDetailError(
                            'Voice saved, but the list could not be refreshed. Reload the page.',
                          ),
                        );
                    }}
                  />
                ))}
                {!lines.length ? (
                  <p className="empty">No dialogue found for this quest.</p>
                ) : !unstageLines.length ? (
                  <p className="empty">No dialogue matches the current filters.</p>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className="stage-results-row">
                <p className="skyrim-results-caption">
                  {chosenQuest.id} · {visible.length} {visible.length === 1 ? 'stage' : 'stages'}
                </p>
                {chosenQuest.objectiveStages !== undefined && (
                  <IgnoreStagesWithoutObjectives
                    stages={ignoredStages}
                    questKey={pluginStageKey(chosenQuest.id)}
                    stageNumbers={stages.map((s) => s.number)}
                    objectiveStages={objectiveStages}
                  />
                )}
              </div>
              <p className="skyrim-match-hint">
                Direct stage conditions in this quest's dialogue only.{' '}
                {chosenQuest.objectiveStages === undefined
                  ? 'Objective links are unavailable for this quest.'
                  : 'Objective links from quest fragment source.'}
              </p>
              <div className="skyrim-stage-list">
                {visible.map((item) => (
                  <section
                    className={`panel skyrim-stage ${ignoredStages.isIgnored(pluginStageKey(chosenQuest.id), item.number) ? 'is-ignored' : ''}`}
                    key={item.number}
                    id={stageAnchor('quest', item.number)}
                  >
                    <div className="skyrim-stage-heading">
                      <strong>Stage {item.number}</strong>
                      <div className="stage-actions">
                        <StageIgnoreToggle
                          ignored={ignoredStages.isIgnored(pluginStageKey(chosenQuest.id), item.number)}
                          stages={ignoredStages}
                          questKey={pluginStageKey(chosenQuest.id)}
                          stage={item.number}
                        />
                        <span>
                          {item.lines.length
                            ? `${item.lines.length} ${item.lines.length === 1 ? 'dialogue' : 'dialogues'}`
                            : 'No direct dialogue'}
                        </span>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => setAddingStage(item.number)}
                        >
                          + Add dialogue
                        </button>
                      </div>
                    </div>
                    <StageObjectives
                      numbers={chosenQuest.stageObjectives?.[item.number]}
                      texts={chosenQuest.objectiveTexts}
                    />
                    {item.lines.map((line) => {
                      const shown = ranges.shownIn(line, item.number);
                      return shown !== undefined ? (
                        <RepeatedLine
                          key={`${line.info}|${line.response}`}
                          text={line.text}
                          label={ranges.label(line)}
                          stage={shown}
                          scope="quest"
                        />
                      ) : (
                        <DialogueEntry
                          key={`${line.info}|${line.response}`}
                          projectId={projectId}
                          questId={chosenQuest.id}
                          line={line}
                          onDeleted={() => removeLine(line)}
                          onTimingSaved={(timing) => updateTiming(line, timing)}
                          onTextSaved={(text) =>
                            setLines((current) =>
                              current.map((item) =>
                                item.info === line.info && item.response === line.response
                                  ? { ...item, text }
                                  : item,
                              ),
                            )
                          }
                          subtitle={line.topicType}
                          badge={ranges.label(line)}
                        />
                      );
                    })}
                  </section>
                ))}
                {!visible.length && (
                  <p className="empty">
                    {status === 'objectives' && !stageOptions.length
                      ? 'No objective-linked stages were found in the quest fragment source.'
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
          stages={chosenQuest.stages}
          destinations={[chosenQuest]}
          onClose={() => setAddingStage(null)}
          onSaved={(quest) => {
            void get<{ lines: Dialogue[] }>(
              `/api/projects/${projectId}/quests/${encodeURIComponent(quest)}/dialogue`,
              new AbortController().signal,
            )
              .then((result) => setLines(result.lines))
              .catch(() =>
                setDetailError(
                  'The dialogue was saved, but the list could not be refreshed. Reload the page; do not save it again.',
                ),
              );
          }}
        />
      )}
    </div>
  );
}
