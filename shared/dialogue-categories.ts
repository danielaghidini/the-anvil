import { isCombatDialogue } from './combat-dialogue.js';

export const dialogueCategories = [
  { id: 'hello', label: 'Hello' },
  { id: 'idle', label: 'Idle' },
  { id: 'dialogue', label: 'Dialogue' },
  { id: 'combat', label: 'Combat' },
  { id: 'scene', label: 'Scene' },
  { id: 'other', label: 'Other' },
] as const;
export type DialogueCategory = (typeof dialogueCategories)[number]['id'];
export type DialogueView = 'stages' | DialogueCategory;
export type TopicDialogue = { topicType: string; topicCategory?: number };

export function dialogueCategory(line: TopicDialogue): DialogueCategory {
  if (isCombatDialogue(line)) return 'combat';
  switch (line.topicType) {
    case 'HELO':
      return 'hello';
    case 'IDLE':
      return 'idle';
    case 'CUST':
      return 'dialogue';
    case 'SCEN':
      return 'scene';
    default:
      return 'other';
  }
}

export function categoryLines<T extends TopicDialogue>(lines: T[], category: DialogueCategory): T[] {
  return lines.filter((line) => dialogueCategory(line) === category);
}

export function dialogueForQuest<T extends { conditions: { questFormId: string }[] }>(
  lines: T[],
  formId: string | null | undefined,
): T[] {
  return formId
    ? lines.filter((line) =>
        line.conditions.some((condition) => condition.questFormId.toUpperCase() === formId.toUpperCase()),
      )
    : [];
}
