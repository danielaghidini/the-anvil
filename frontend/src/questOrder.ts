import type { PluginQuest } from '../../shared/types';

/**
 * Sorts quests by the user's manual order when there is one, then by the order detected from the
 * plugin. Quests missing from both keep their import order at the end.
 */
export function sortQuests(
  quests: PluginQuest[],
  detected?: string[],
  manual?: string[] | null,
): PluginQuest[] {
  const rank = (list: string[] | null | undefined) =>
    new Map((list ?? []).map((id, index) => [id.toLowerCase(), index]));
  const manualRank = rank(manual),
    detectedRank = rank(detected),
    original = new Map(quests.map((q, index) => [q.id, index]));
  const key = (q: PluginQuest): [number, number] => {
    const id = q.id.toLowerCase();
    if (manualRank.has(id)) return [0, manualRank.get(id)!];
    if (detectedRank.has(id)) return [1, detectedRank.get(id)!];
    return [2, original.get(q.id)!];
  };
  return [...quests].sort((a, b) => {
    const [ga, ia] = key(a),
      [gb, ib] = key(b);
    return ga - gb || ia - ib;
  });
}

/** Moves a quest one place up or down among the visible quests, returning the new full order. */
export function moveQuest(
  order: string[],
  visible: string[],
  questId: string,
  direction: -1 | 1,
): string[] | null {
  const index = visible.indexOf(questId),
    neighbor = visible[index + direction];
  if (index < 0 || neighbor === undefined) return null;
  const next = order.filter((id) => id !== questId),
    at = next.indexOf(neighbor);
  next.splice(direction < 0 ? at : at + 1, 0, questId);
  return next;
}
