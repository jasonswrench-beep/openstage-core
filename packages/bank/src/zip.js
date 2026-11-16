// Reads the entries of a ZIP archive in a browser or in Node: stored and deflated entries, each checked against its
// CRC-32, with limits on how many entries there are and how large each grows when unpacked. ZIP64 and encrypted
// entries are refused. Unpacking uses DecompressionStream("deflate-raw") where there is one, else node:zlib, else an
// inflate function the caller passes.

export class ZipError extends Error {}

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;

let TABLE;
function crcTable() {
  if (!TABLE) {
    TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c >>> 0;
    }
  }
  return TABLE;
}

export function crc32(bytes) {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function defaultInflate(data, limit) {
  if (typeof DecompressionStream === "function") {
    let stream;
    try {
      stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    } catch {
      stream = undefined;
    }
    if (stream) {
      const reader = stream.getReader();
      const parts = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) {
          await reader.cancel();
          throw new ZipError(`unpacks to more than ${limit} bytes`);
        }
        parts.push(value);
      }
      const out = new Uint8Array(size);
      let at = 0;
      for (const p of parts) {
        out.set(p, at);
        at += p.length;
      }
      return out;
    }
  }
  const zlib = await import("node:zlib");
  try {
    return new Uint8Array(zlib.inflateRawSync(data, { maxOutputLength: limit }));
  } catch (e) {
    throw new ZipError(e.code === "ERR_BUFFER_TOO_LARGE" ? `unpacks to more than ${limit} bytes` : e.message);
  }
}

/**
 * Opens an archive's directory. `entry(name)` unpacks one entry; `names` lists them in the archive's order.
 * @param {Uint8Array} bytes
 * @param {{ maxEntries?: number, maxEntry?: number, maxTotal?: number, inflateRaw?: (data: Uint8Array, limit: number) => Uint8Array | Promise<Uint8Array> }} [options]
 */
export function openZip(bytes, options = {}) {
  const maxEntries = options.maxEntries ?? 100_000;
  const maxEntry = options.maxEntry ?? 256 * 1024 * 1024;
  const maxTotal = options.maxTotal ?? 2 * 1024 * 1024 * 1024;
  const inflate = options.inflateRaw ?? defaultInflate;
  if (!(bytes instanceof Uint8Array)) throw new ZipError("the bytes must be a Uint8Array");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (i) => (i + 2 <= bytes.length ? view.getUint16(i, true) : -1);
  const u32 = (i) => (i + 4 <= bytes.length ? view.getUint32(i, true) : -1);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (u32(i) === END) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ZipError("it is not a ZIP file");
  const count = u16(end + 10);
  const cd = u32(end + 16);
  if (count === 0xffff || cd === 0xffffffff) throw new ZipError("it is a ZIP64 archive, which is not read");
  if (count > maxEntries) throw new ZipError(`it has ${count} entries, more than ${maxEntries}`);
  const entries = new Map();
  const names = [];
  const decoder = new TextDecoder();
  let p = cd;
  for (let n = 0; n < count; n++) {
    if (u32(p) !== CENTRAL) throw new ZipError("its list of entries is damaged");
    const flags = u16(p + 8);
    const method = u16(p + 10);
    const crc = u32(p + 16);
    const packed = u32(p + 20);
    const size = u32(p + 24);
    const nameLength = u16(p + 28);
    const extraLength = u16(p + 30);
    const commentLength = u16(p + 32);
    const offset = u32(p + 42);
    if (p + 46 + nameLength > bytes.length) throw new ZipError("its list of entries is cut short");
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength)).replaceAll("\\", "/");
    if (!entries.has(name)) {
      entries.set(name, { flags, method, crc, packed, size, offset });
      names.push(name);
    }
    p += 46 + nameLength + extraLength + commentLength;
  }
  let unpacked = 0;
  return {
    names,
    has: (name) => entries.has(name),
    /** The entry's bytes, unpacked and checked. */
    async entry(name) {
      const e = entries.get(name);
      if (!e) throw new ZipError(`${name} is not in the archive`);
      if (e.flags & 1) throw new ZipError(`${name} is encrypted`);
      if (e.size > maxEntry) throw new ZipError(`${name} unpacks to more than ${maxEntry} bytes`);
      if (unpacked + e.size > maxTotal) throw new ZipError(`the archive unpacks to more than ${maxTotal} bytes in all`);
      unpacked += e.size;
      if (u32(e.offset) !== LOCAL) throw new ZipError(`${name}'s header is damaged`);
      const start = e.offset + 30 + u16(e.offset + 26) + u16(e.offset + 28);
      if (start + e.packed > bytes.length) throw new ZipError(`${name} is cut short`);
      const data = bytes.subarray(start, start + e.packed);
      let out;
      if (e.method === 0) out = data.slice();
      else if (e.method === 8) out = await inflate(data, Math.min(maxEntry, e.size));
      else throw new ZipError(`${name} is packed in a way that is not read (method ${e.method})`);
      if (out.length !== e.size) throw new ZipError(`${name} is not the size its archive says`);
      if (crc32(out) !== e.crc) throw new ZipError(`${name} is damaged (its check value does not match)`);
      return out;
    },
  };
}
