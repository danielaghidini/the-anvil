import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fields, records } from './quest-dialogue.js';

/** How strongly one quest is evidenced to come before another. */
const WEIGHT = { start: 3, advance: 1, condition: 1 } as const;
type Edge = { from: string; to: string; weight: number };
type QuestInfo = { id: string; formId: string; stages?: number[] };

const hex = (n: number) => n.toString(16).padStart(8, '0').toUpperCase();

/** Script names and their single-object properties (name -> form ID) from a VMAD subrecord. */
export function vmadObjectProperties(data: Buffer): { script: string; properties: Map<string, string> }[] {
  let p = 0;
  const take = (n: number) => {
    if (n < 0 || p + n > data.length) throw new Error('Invalid VMAD');
    const b = data.subarray(p, p + n);
    p += n;
    return b;
  };
  const u8 = () => take(1).readUInt8(),
    u16 = () => take(2).readUInt16LE(),
    u32 = () => take(4).readUInt32LE(),
    str = () => take(u16()).toString('utf8');
  take(2);
  const objectFormat = u16(),
    count = u16();
  if (count > 10000) throw new Error('Invalid VMAD');
  /** Returns the form ID of a plain object value (not an alias), otherwise undefined. */
  const object = () => {
    const raw = take(8);
    const [formId, alias] =
      objectFormat === 1
        ? [raw.readUInt32LE(0), raw.readInt16LE(4)]
        : [raw.readUInt32LE(4), raw.readInt16LE(2)];
    return alias === -1 && formId ? hex(formId) : undefined;
  };
  const skip = (t: number) => {
    if (t === 1) take(8);
    else if (t === 2) str();
    else if (t === 3 || t === 4) take(4);
    else if (t === 5) take(1);
    else throw new Error('Unsupported VMAD property');
  };
  const result: { script: string; properties: Map<string, string> }[] = [];
  for (let i = 0; i < count; i++) {
    const script = str();
    take(1);
    const total = u16(),
      properties = new Map<string, string>();
    if (total > 10000) throw new Error('Invalid VMAD');
    for (let j = 0; j < total; j++) {
      const name = str(),
        t = u8();
      take(1);
      if (t === 1) {
        const formId = object();
        if (formId) properties.set(name.toLowerCase(), formId);
      } else if (t >= 11 && t <= 15) {
        const n = u32();
        if (n > 100000) throw new Error('Invalid VMAD array');
        for (let k = 0; k < n; k++) skip(t - 10);
      } else skip(t);
    }
    if (/^[a-z0-9_]+$/i.test(script)) result.push({ script, properties });
  }
  return result;
}

/** Calls in Papyrus source that start or advance a quest held in a property. */
export function questCallsFromSource(
  source: string,
): { property: string; kind: 'start' | 'setStage'; stage?: number }[] {
  const code = source
    .replace(/;\/[\s\S]*?\/;/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/;[^\r\n]*/g, '');
  const calls: { property: string; kind: 'start' | 'setStage'; stage?: number }[] = [];
  for (const m of code.matchAll(
    /(?:\(\s*([A-Za-z_]\w*)\s+as\s+Quest\s*\)|\b([A-Za-z_]\w*))\s*\.\s*(Start|SetStage|SetCurrentStageID)\s*\(\s*(\d+)?/gi,
  ))
    calls.push({
      property: (m[1] ?? m[2]).toLowerCase(),
      kind: m[3].toLowerCase() === 'start' ? 'start' : 'setStage',
      ...(m[4] !== undefined ? { stage: Number(m[4]) } : {}),
    });
  return calls;
}

/**
 * Orders quests so each one follows the quests that start or advance it, keeping chains together.
 * Ties fall back to Start Game Enabled quests and then creation order (form ID).
 */
export function orderQuests(quests: QuestInfo[], edges: Edge[], startEnabled: Set<string>): string[] {
  const byId = new Map(quests.map((q) => [q.id, q])),
    best = new Map<string, Edge>();
  for (const e of edges) {
    if (e.from === e.to || !byId.has(e.from) || !byId.has(e.to)) continue;
    const k = `${e.from}\n${e.to}`;
    if ((best.get(k)?.weight ?? 0) < e.weight) best.set(k, e);
  }
  const kept: Edge[] = [];
  for (const e of best.values()) {
    const reverse = best.get(`${e.to}\n${e.from}`);
    if (!reverse || reverse.weight < e.weight) kept.push(e);
  }
  // Only a quest starting another is a hard constraint; weaker evidence just breaks ties.
  const incoming = new Map<string, Edge[]>(quests.map((q) => [q.id, []])),
    hints = new Map<string, Edge[]>(quests.map((q) => [q.id, []]));
  for (const e of kept) (e.weight >= WEIGHT.start ? incoming : hints).get(e.to)!.push(e);
  const position = new Map<string, number>(),
    order: string[] = [],
    remaining = new Set(quests.map((q) => q.id));
  const latest = (list: Edge[]) => Math.max(-1, ...list.map((e) => position.get(e.from) ?? -1));
  const compare = (a: string, b: string) => {
    // Prefer continuing the chain of the quest placed most recently.
    const strong = latest(incoming.get(b)!) - latest(incoming.get(a)!);
    if (strong) return strong;
    const weak = latest(hints.get(b)!) - latest(hints.get(a)!);
    if (weak) return weak;
    const enabled = Number(startEnabled.has(b)) - Number(startEnabled.has(a));
    if (enabled) return enabled;
    return byId.get(a)!.formId.localeCompare(byId.get(b)!.formId);
  };
  while (remaining.size) {
    const ready = [...remaining].filter((id) => incoming.get(id)!.every((e) => !remaining.has(e.from)));
    let next: string;
    if (ready.length) next = ready.sort(compare)[0];
    else {
      // Cycle: release the quest with the least evidence of needing something still pending.
      const pressure = (id: string) =>
        incoming
          .get(id)!
          .filter((e) => remaining.has(e.from))
          .reduce((sum, e) => sum + e.weight, 0);
      next = [...remaining].sort((a, b) => pressure(a) - pressure(b) || compare(a, b))[0];
    }
    remaining.delete(next);
    position.set(next, order.length);
    order.push(next);
  }
  return order;
}

async function scriptSources(dataDirectory: string) {
  const dir = path.join(dataDirectory, 'Source', 'Scripts');
  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch {}
  const names = new Map(files.filter((f) => /^[a-z0-9_]+\.psc$/i.test(f)).map((f) => [f.toLowerCase(), f])),
    cache = new Map<string, Promise<string | null>>();
  return (script: string) => {
    const key = script.toLowerCase();
    let value = cache.get(key);
    if (!value) {
      const file = names.get(key + '.psc');
      value = file ? readFile(path.join(dir, file), 'utf8').catch(() => null) : Promise.resolve(null);
      cache.set(key, value);
    }
    return value;
  };
}

/** Evidence of quests starting or depending on each other, from scripts and dialogue conditions. */
export async function detectQuestEdges(buffer: Buffer, dataDirectory: string, quests: QuestInfo[]) {
  const byForm = new Map(quests.map((q) => [q.formId.toUpperCase(), q.id])),
    // Stage 0 is usually a start-up stage, so the first real stage is the lowest one above it.
    firstStage = new Map(
      quests.map((q) => {
        const real = (q.stages ?? []).filter((n) => n > 0);
        return [q.id, real.length ? Math.min(...real) : 0];
      }),
    ),
    source = await scriptSources(dataDirectory),
    topics = new Map<number, string>(),
    owned: { owner: string; vmad: Buffer }[] = [],
    edges: Edge[] = [],
    startEnabled = new Set<string>();
  const entries = [
    ...records(buffer, 0, buffer.length, undefined, new Set(['QUST', 'DIAL', 'INFO', 'SCEN'])),
  ];
  for (const rec of entries) {
    if (rec.type !== 'DIAL') continue;
    const owner = [...fields(rec.data)].find(([t]) => t === 'QNAM')?.[1];
    if (owner?.length === 4) topics.set(rec.id, hex(owner.readUInt32LE()));
  }
  for (const rec of entries) {
    const f = [...fields(rec.data)],
      vmad = f.find(([t]) => t === 'VMAD')?.[1];
    let owner: string | undefined;
    if (rec.type === 'QUST') {
      owner = hex(rec.id);
      const flags = f.find(([t]) => t === 'DNAM')?.[1];
      if (flags && flags.length >= 2 && flags.readUInt16LE(0) & 1 && byForm.has(owner))
        startEnabled.add(byForm.get(owner)!);
    } else if (rec.type === 'SCEN') {
      const parent = f.find(([t]) => t === 'PNAM')?.[1];
      owner = parent?.length === 4 ? hex(parent.readUInt32LE()) : undefined;
    } else if (rec.type === 'INFO' && rec.topic !== undefined) {
      owner = topics.get(rec.topic);
      const to = owner && byForm.get(owner);
      if (to)
        for (const [t, value] of f) {
          if (t !== 'CTDA' || value.length < 32) continue;
          const fn = value.readUInt16LE(8);
          if (fn !== 58 && fn !== 59) continue;
          const from = byForm.get(hex(value.readUInt32LE(12)));
          if (from) edges.push({ from, to, weight: WEIGHT.condition });
        }
    }
    if (owner && vmad && byForm.has(owner)) owned.push({ owner, vmad });
  }
  for (const { owner, vmad } of owned) {
    let scripts: ReturnType<typeof vmadObjectProperties>;
    try {
      scripts = vmadObjectProperties(vmad);
    } catch {
      continue;
    }
    for (const { script, properties } of scripts) {
      if (!properties.size) continue;
      const code = await source(script);
      if (!code) continue;
      for (const call of questCallsFromSource(code)) {
        const target = properties.get(call.property),
          to = target && byForm.get(target);
        if (!to) continue;
        // Setting a quest's first stage starts it; later stages only show the two run together.
        const starts =
          call.kind === 'start' || (call.stage !== undefined && call.stage <= (firstStage.get(to) ?? 0));
        edges.push({ from: byForm.get(owner)!, to, weight: starts ? WEIGHT.start : WEIGHT.advance });
      }
    }
  }
  return { edges, startEnabled };
}
/** Detects the order in which the plugin's quests start. */
export async function detectQuestOrder(buffer: Buffer, dataDirectory: string, quests: QuestInfo[]) {
  const { edges, startEnabled } = await detectQuestEdges(buffer, dataDirectory, quests);
  return orderQuests(quests, edges, startEnabled);
}
