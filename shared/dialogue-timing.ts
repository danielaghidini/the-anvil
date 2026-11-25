export type DialogueTiming = {
  resetHours: number;
  sayOnce: boolean;
  timingFormat: 'compact' | 'legacy';
};
export type DialogueTimingFields = Partial<DialogueTiming> & {
  timingEditable?: boolean;
  responseCount?: number;
};
export const displayResetHours = (hours: number) => String(Number(hours.toFixed(2)));
