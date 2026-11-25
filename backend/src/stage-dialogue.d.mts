export type IdleCondition = {
  function: string;
  operator: string;
  runOn: string;
  value: number;
  stage?: number;
};
type StageDialogueInput = {
  text: string;
  type: 'IDLE' | 'HELO';
  ownerFormId: string;
  speakerFormId: string;
  gameFormId: string;
  stage: number;
  emotionType?: number;
  emotionValue?: number;
  resetHours?: number;
  sayOnce?: boolean;
  conditions?: IdleCondition[];
  locations?: string[];
  outdoors?: boolean;
};

export type ScannedGroup = {
  type: 'GRUP';
  offset: number;
  next: number;
  parent: ScannedGroup | null;
  groupType: number;
  label: number;
};
export type ScannedRecord = {
  type: string;
  offset: number;
  next: number;
  parent: ScannedGroup | null;
  id: number;
  flags: number;
  data: Buffer;
};
export function scan(buffer: Buffer): (ScannedGroup | ScannedRecord)[];
export function subrecords(data: Buffer): { type: string; offset: number; value: Buffer }[];
export function sub(type: string, value: Buffer): Buffer;
export function encodeLocationConditions(locations: string[], outdoors?: boolean): Buffer[];
export const sayOnceFlag: number;
export function isDraftGate(value: Buffer): boolean;
export function ensureEditorClosed(): void;
export function replacePlugin(
  file: string,
  backupDirectory: string,
  original: Buffer,
  modified: Buffer,
): string;
export function buildStageDialogue(
  original: Buffer,
  input: StageDialogueInput & { pendingVoice?: boolean },
): { modified: Buffer; info: string; topicName: string; text: string };
export function createStageDialogue(
  file: string,
  backupDirectory: string,
  input: StageDialogueInput,
  assertEditorClosed?: () => void,
  installVoice?: (info: string, topic: string) => void,
): { info: string; backup: string; text: string };
