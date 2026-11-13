type Stage = { number: number; lines: unknown[] };
export function QuestCoverage({
  stages,
  isIgnored = () => false,
}: {
  stages: Stage[];
  isIgnored?: (stage: Stage) => boolean;
}) {
  if (!stages.length) return null;
  const active = stages.filter((stage) => !isIgnored(stage)),
    ignored = stages.length - active.length,
    covered = active.filter((stage) => stage.lines.length > 0).length,
    total = active.length,
    percent = total ? Math.round((covered / total) * 100) : 0;
  return (
    <div className="quest-coverage">
      <div className="quest-coverage-label">
        <span>
          Stages with direct dialogue · {covered} of {total}
          {ignored > 0 && ` · ${ignored} ignored`}
        </span>
        <strong>{total ? `${percent}%` : '—'}</strong>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Stages with direct dialogue"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={covered}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
