export type NewQuestInput = {
  editorId: string;
  name?: string;
  type?: number;
  priority?: number;
  startGameEnabled?: boolean;
  runOnce?: boolean;
};
export function createQuest(
  file: string,
  backupDirectory: string,
  input: NewQuestInput,
  assertEditorClosed?: () => void,
): { formId: string; editorId: string; backup: string };
