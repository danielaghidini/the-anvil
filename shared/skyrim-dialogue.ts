import { stageMatchesDirectConditions, type StageCondition } from './stage-match.js';
export type StageDialogue = { text: string; conditions: StageCondition[]; pendingVoice?: boolean };
export type StageGroup<T extends StageDialogue> = { number: number; lines: T[] };
export type VoiceFilter = '' | 'no-voice' | 'with-voice';
export function matchesVoiceFilter(line: { voices?: readonly unknown[] }, filter: VoiceFilter) {
  return !filter || (filter === 'with-voice' ? !!line.voices?.length : !line.voices?.length);
}
export function filterStagesByVoice<T extends StageDialogue & { voices?: readonly unknown[] }>(
  groups: StageGroup<T>[],
  filter: VoiceFilter,
): StageGroup<T>[] {
  if (!filter) return groups;
  return groups
    .map((group) => ({ ...group, lines: group.lines.filter((line) => matchesVoiceFilter(line, filter)) }))
    .filter((group) => group.lines.length > 0);
}
export function groupStageDialogues<T extends StageDialogue>(
  stages: number[],
  questFormId: string,
  lines: T[],
): StageGroup<T>[] {
  return [...stages]
    .sort((a, b) => a - b)
    .map((number) => ({
      number,
      lines: lines.filter((line) => stageMatchesDirectConditions(number, questFormId, line.conditions)),
    }));
}
export function filterStageDialogues<T extends StageDialogue>(
  groups: StageGroup<T>[],
  stage: string,
  status: string,
  query: string,
  objectiveStages: ReadonlySet<number> = new Set(),
): StageGroup<T>[] {
  const term = query.trim().toLowerCase();
  const result = groups
    .filter(
      (item) =>
        (!stage || String(item.number) === stage) &&
        (!status ||
          status === 'most' ||
          status === 'fewest' ||
          status === 'review' ||
          (status === 'objectives'
            ? objectiveStages.has(item.number)
            : status === 'missing'
              ? item.lines.length === 0
              : item.lines.length > 0)),
    )
    .map((item) => ({
      ...item,
      lines: item.lines.filter(
        (line) => (status !== 'review' || line.pendingVoice) && line.text.toLowerCase().includes(term),
      ),
    }))
    .filter((item) => (!term && status !== 'review') || item.lines.length > 0);
  if (status === 'most' || status === 'fewest')
    result.sort(
      (a, b) =>
        (status === 'most' ? b.lines.length - a.lines.length : a.lines.length - b.lines.length) ||
        a.number - b.number,
    );
  return result;
}

export function objectiveStageMap(labels: string[]): Map<number, number[]> {
  const result = new Map<number, number[]>();
  for (const label of labels) {
    const match = /^\s*(\d+(?:\s*,\s*\d+)*)\s*\/\s*obj\.\s*(\d+)\s*$/i.exec(label);
    if (!match) continue;
    const objective = Number(match[2]);
    for (const value of match[1].split(',')) {
      const stage = Number(value.trim()),
        items = result.get(stage) ?? [];
      if (!items.includes(objective)) items.push(objective);
      result.set(stage, items);
    }
  }
  return result;
}
