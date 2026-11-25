export function editDialogue(
  file: string,
  backupDirectory: string,
  input: { questFormId: string; info: string; response: number; text: string; expectedText: string },
  assertEditorClosed?: () => void,
  approve?: boolean,
): { text: string; backup?: string; unchanged?: boolean };

export function deleteDialogue(
  file: string,
  backupDirectory: string,
  input: { questFormId: string; info: string; response: number; expectedText: string },
  assertEditorClosed?: () => void,
): { backup: string };

export function editDialogueTiming(
  file: string,
  backupDirectory: string,
  input: {
    questFormId: string;
    info: string;
    response: number;
    expectedText: string;
    resetHours: number;
    sayOnce: boolean;
    expectedResetHours: number;
    expectedSayOnce: boolean;
  },
  assertEditorClosed?: () => void,
): import('../../shared/dialogue-timing.js').DialogueTiming & { backup?: string; unchanged?: boolean };
