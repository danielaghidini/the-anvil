import {
  dialogueCategories,
  dialogueCategory,
  type DialogueView,
  type TopicDialogue,
} from '../../shared/dialogue-categories';

export function DialogueCategories({
  lines,
  value,
  onChange,
  disabled = false,
  stageLabel = 'Stages',
}: {
  lines: TopicDialogue[];
  value: DialogueView;
  onChange: (value: DialogueView) => void;
  disabled?: boolean;
  stageLabel?: 'Stages' | 'All';
}) {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const category = dialogueCategory(line);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return (
    <div className="dialogue-categories" role="group" aria-label="Dialogue categories">
      <button
        type="button"
        aria-pressed={value === 'stages'}
        className={value === 'stages' ? 'active' : ''}
        disabled={disabled}
        onClick={() => onChange('stages')}
      >
        {stageLabel}
      </button>
      {dialogueCategories
        .filter((category) => category.id !== 'other' || counts.has('other') || value === 'other')
        .map((category) => (
          <button
            type="button"
            key={category.id}
            aria-pressed={value === category.id}
            className={value === category.id ? 'active' : ''}
            disabled={disabled}
            onClick={() => onChange(category.id)}
          >
            {category.label} <small>{counts.get(category.id) ?? 0}</small>
          </button>
        ))}
    </div>
  );
}
