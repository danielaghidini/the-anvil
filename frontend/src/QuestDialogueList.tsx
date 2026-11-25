import { useState } from 'react';
import type { DialogueTiming, DialogueTimingFields } from '../../shared/dialogue-timing';
import {
  categoryLines,
  dialogueCategories,
  type DialogueCategory,
  type TopicDialogue,
} from '../../shared/dialogue-categories';
import { combatEventLabel } from '../../shared/combat-dialogue';
import { matchesVoiceFilter, type VoiceFilter } from '../../shared/skyrim-dialogue';
import { AssignmentSelect } from './QuestDashboard';
import { DialogueEntry, type VoiceChoice } from './DialogueEntry';

export type QuestDialogueLine = TopicDialogue &
  DialogueTimingFields & {
    info: string;
    response: number;
    text: string;
    topicEditorId?: string;
    modQuest?: string;
    speaker?: string;
    pendingVoice?: boolean;
    canDelete?: boolean;
    voices?: VoiceChoice[];
  };

export function QuestDialogueList<T extends QuestDialogueLine>({
  projectId,
  questId,
  lines,
  category,
  query,
  voiceFilter,
  onTextSaved,
  onDeleted,
  onVoiceSaved,
  onTimingSaved,
  preferredCharacterId,
}: {
  projectId: number;
  questId: string;
  lines: T[];
  category: DialogueCategory;
  query: string;
  voiceFilter: VoiceFilter;
  onTextSaved: (line: T, text: string) => void;
  onDeleted: (line: T) => void;
  onVoiceSaved: (line: T) => void;
  onTimingSaved?: (line: T, timing: DialogueTiming) => void;
  preferredCharacterId?: number;
}) {
  const [event, setEvent] = useState('');
  const categorized = categoryLines(lines, category);
  const events = [...new Set(categorized.map((line) => line.topicType))]
    .map((value) => ({ value, label: combatEventLabel(value) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const term = query.trim().toLowerCase();
  const visible = categorized.filter(
    (line) =>
      (category !== 'combat' || !event || line.topicType === event) &&
      matchesVoiceFilter(line, voiceFilter) &&
      (!term ||
        [line.text, line.topicEditorId, combatEventLabel(line.topicType)].some((value) =>
          value?.toLowerCase().includes(term),
        )),
  );
  const label = dialogueCategories.find((item) => item.id === category)!.label;
  return (
    <div className="quest-dialogue-category">
      <div className="dialogue-category-heading">
        <p className="skyrim-results-caption">
          {label} · {visible.length} of {categorized.length} responses
        </p>
        {category === 'combat' && (
          <AssignmentSelect
            value={event}
            placeholder="All combat events"
            disabled={false}
            options={events}
            onChange={setEvent}
          />
        )}
      </div>
      <div className="panel skyrim-stage">
        {visible.map((line) => (
          <DialogueEntry
            key={`${line.modQuest ?? questId}|${line.info}|${line.response}|${line.text}`}
            projectId={projectId}
            questId={line.modQuest ?? questId}
            line={{ ...line, canEdit: line.canDelete !== false }}
            subtitle={`${line.modQuest ? `${line.modQuest} · ` : ''}${category === 'combat' ? combatEventLabel(line.topicType) : label} · ${line.topicEditorId || line.info}`}
            preferredCharacterId={preferredCharacterId}
            onTextSaved={(text) => onTextSaved(line, text)}
            onDeleted={() => onDeleted(line)}
            onTimingSaved={(timing) => onTimingSaved?.(line, timing)}
            onVoiceSaved={() => onVoiceSaved(line)}
          />
        ))}
        {!visible.length && (
          <p className="empty">
            {categorized.length
              ? 'No dialogue matches the current filters.'
              : `No ${label.toLowerCase()} dialogue found for this quest.`}
          </p>
        )}
      </div>
    </div>
  );
}
