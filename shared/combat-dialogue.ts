// Skyrim DIAL SNAM signatures, as defined by xEdit's wbSubtypeNamesEnum.
export const combatEvents: Record<string, string> = {
  ATCK: 'Attack',
  POAT: 'Power attack',
  BASH: 'Bash',
  HIT_: 'Hit',
  FLEE: 'Flee',
  BLED: 'Bleedout',
  AVTH: 'Avoid threat',
  DETH: 'Death',
  GRST: 'Group strategy',
  BLOC: 'Block',
  TAUT: 'Taunt',
  ALKL: 'Ally killed',
  YIEL: 'Yield',
  ACYI: 'Accept yield',
  GRNT: 'Combat grunt',
  ALIL: 'Alert idle',
  LOIL: 'Lost idle',
  NOTA: 'Normal to alert',
  ALTC: 'Alert to combat',
  NOTC: 'Normal to combat',
  ALTN: 'Alert to normal',
  COTN: 'Combat to normal',
  COLO: 'Combat to lost',
  LOTN: 'Lost to normal',
  LOTC: 'Lost to combat',
  DFDA: 'Detect friend dying',
  OBCO: 'Observe combat',
};

export function isCombatDialogue(line: { topicType: string; topicCategory?: number }) {
  return line.topicCategory === 3 || Object.hasOwn(combatEvents, line.topicType);
}

export function combatEventLabel(type: string) {
  return combatEvents[type] ?? type;
}
