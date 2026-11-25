// xEdit INFO definition: ENAM stores reset hours as uint16 / 2730.625;
// Legacy DATA stores reset days as float32. Say once is bit 2 of the response flags.
// https://github.com/TES5Edit/TES5Edit/blob/dev-4.1.6/Core/wbDefinitionsTES5.pas
const resetScale = 2730.625;
export function readDialogueTiming(enam, legacy) {
  if ((enam && enam.length !== 4) || (legacy && legacy.length !== 8)) return null;
  const timingFormat = enam || !legacy ? 'compact' : 'legacy';
  const resetHours = enam ? enam.readUInt16LE(2) / resetScale : legacy ? legacy.readFloatLE(4) * 24 : 0;
  const flags = enam ? enam.readUInt16LE(0) : legacy ? legacy.readUInt16LE(2) : 0;
  if (!Number.isFinite(resetHours) || resetHours < 0) return null;
  return { resetHours, sayOnce: Boolean(flags & 4), timingFormat };
}
export function encodeResetHours(hours) {
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0 || hours > 24)
    throw Object.assign(new Error('Enter reset hours between 0 and 24.'), { status: 400 });
  return Math.round(hours * resetScale);
}
