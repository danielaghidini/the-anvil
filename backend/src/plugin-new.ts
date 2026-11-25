import { existsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const BASE_MASTERS = [
  'Skyrim.esm',
  'Update.esm',
  'Dawnguard.esm',
  'HearthFires.esm',
  'Dragonborn.esm',
];

export type NewPluginInput = {
  fileName: string;
  author?: string;
  description?: string;
  masters?: string[];
};

const fail = (statusCode: number, message: string): never => {
  throw Object.assign(new Error(message), { statusCode });
};

const sub = (type: string, value: Buffer) => {
  if (value.length > 0xffff) fail(400, `${type} is too long.`);
  const h = Buffer.alloc(6);
  h.write(type, 'ascii');
  h.writeUInt16LE(value.length, 4);
  return Buffer.concat([h, value]);
};
const zstring = (value: string) => Buffer.from(value + '\0', 'latin1');
const printable = (value: string) => /^[\x20-\x7e]*$/.test(value);

export function normalizePluginFileName(raw: string) {
  let name = raw.trim();
  if (!/\.esp$/i.test(name)) name += '.esp';
  const stem = name.slice(0, -4);
  if (!/^[A-Za-z0-9][A-Za-z0-9 _\-'().]{0,59}$/.test(stem) || /\.$/.test(stem))
    fail(400, "Use 1–60 letters, digits, spaces, or _ - . ' ( ) for the file name.");
  if (BASE_MASTERS.some((m) => m.slice(0, -4).toLowerCase() === stem.toLowerCase()))
    fail(400, 'That name is reserved by the base game.');
  return stem + '.esp';
}

export function masterAvailability(dataDirectory: string) {
  return BASE_MASTERS.map((name) => ({ name, available: existsSync(path.join(dataDirectory, name)) }));
}

/** Builds a minimal Skyrim SE plugin: just a TES4 header with HEDR, author, description and masters. */
export function buildEmptyPlugin(input: Omit<NewPluginInput, 'fileName'>) {
  const author = (input.author ?? '').trim(),
    description = (input.description ?? '').trim();
  if (author.length > 100 || !printable(author))
    fail(400, 'Enter up to 100 ASCII characters for the author.');
  if (description.length > 500 || !printable(description))
    fail(400, 'Enter up to 500 ASCII characters for the description.');
  const requested = new Set((input.masters ?? []).map((m) => m.toLowerCase()));
  for (const m of requested)
    if (!BASE_MASTERS.some((b) => b.toLowerCase() === m)) fail(400, `Unsupported master: ${m}.`);
  const masters = BASE_MASTERS.filter((m, i) => i === 0 || requested.has(m.toLowerCase()));

  const hedr = Buffer.alloc(12);
  hedr.writeFloatLE(1.71, 0);
  hedr.writeUInt32LE(0, 4);
  hedr.writeUInt32LE(0x800, 8);
  const data = Buffer.concat([
    sub('HEDR', hedr),
    sub('CNAM', zstring(author || 'DEFAULT')),
    ...(description ? [sub('SNAM', zstring(description))] : []),
    ...masters.flatMap((m) => [sub('MAST', zstring(m)), sub('DATA', Buffer.alloc(8))]),
  ]);
  const header = Buffer.alloc(24);
  header.write('TES4', 'ascii');
  header.writeUInt32LE(data.length, 4);
  header.writeUInt16LE(44, 20);
  return { buffer: Buffer.concat([header, data]), masters };
}

/** Writes a new, empty plugin into the data folder. Never overwrites an existing file. */
export function createEmptyPlugin(dataDirectory: string, input: NewPluginInput) {
  if (!existsSync(dataDirectory) || !statSync(dataDirectory).isDirectory())
    fail(422, `The Skyrim Data folder was not found: ${dataDirectory}`);
  const fileName = normalizePluginFileName(input.fileName);
  const { buffer, masters } = buildEmptyPlugin(input);
  const missing = masters.filter((m) => !existsSync(path.join(dataDirectory, m)));
  if (missing.length) fail(422, `Missing in the Data folder: ${missing.join(', ')}.`);
  const file = path.join(dataDirectory, fileName);
  if (existsSync(file)) fail(409, `${fileName} already exists in the Data folder.`);
  try {
    writeFileSync(file, buffer, { flag: 'wx' });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST')
      fail(409, `${fileName} already exists in the Data folder.`);
    throw e;
  }
  return { file, fileName, masters };
}
