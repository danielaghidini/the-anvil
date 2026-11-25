import { CornerDownRight } from 'lucide-react';

type Group<T> = { number: number; lines: T[] };

/**
 * Tracks lines whose conditions match several stages, so each one is shown in full only once:
 * in the first visible stage it matches. The other stages get a short reference instead.
 */
export function stageRanges<T extends object>(all: Group<T>[], visible: Group<T>[]) {
  const stagesOf = new Map<T, number[]>(),
    firstVisible = new Map<T, number>();
  for (const group of all)
    for (const line of group.lines) {
      const list = stagesOf.get(line) ?? [];
      list.push(group.number);
      stagesOf.set(line, list);
    }
  for (const group of visible)
    for (const line of group.lines) if (!firstVisible.has(line)) firstVisible.set(line, group.number);
  return {
    /** "7 stages: 0–30" for a line matching several stages, otherwise undefined. */
    label(line: T) {
      const stages = stagesOf.get(line) ?? [];
      if (stages.length < 2) return undefined;
      return `${stages.length} stages: ${stages[0]}–${stages[stages.length - 1]}`;
    },
    /** The stage where this line is shown in full, when it is not the given stage. */
    shownIn(line: T, stage: number) {
      const first = firstVisible.get(line);
      return first !== undefined && first !== stage ? first : undefined;
    },
  };
}

export const stageAnchor = (scope: string, stage: number) =>
  `stage-${scope.replace(/[^a-z0-9_-]/gi, '_')}-${stage}`;

/** A compact pointer to a line already shown in full in an earlier stage. */
export function RepeatedLine({
  text,
  label,
  stage,
  scope,
}: {
  text: string;
  label?: string;
  stage: number;
  scope: string;
}) {
  return (
    <div className="dialogue-repeat">
      <CornerDownRight size={15} aria-hidden="true" />
      <span className="dialogue-repeat-text">{text}</span>
      {label && <span className="dialogue-badge">{label}</span>}
      <button
        type="button"
        className="link-button"
        onClick={() =>
          document
            .getElementById(stageAnchor(scope, stage))
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      >
        Shown in Stage {stage}
      </button>
    </div>
  );
}
