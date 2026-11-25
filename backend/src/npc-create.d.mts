export type NewNpcInput = { editorId: string; name?: string };
export function createNpc(
  file: string,
  backupDirectory: string,
  input: NewNpcInput,
  assertEditorClosed?: () => void,
): { formId: string; editorId: string; backup: string };
