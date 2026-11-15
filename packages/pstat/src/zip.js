// The smallest ZIP reader and writer a .pstat file needs: one entry, stored or deflated, no encryption, no ZIP64.
// Node only (node:zlib). See specs/pstat/PSTAT-1.md, section 2.

import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;

/** The most an entry may unpack to (PSTAT-1 rule Z3). */
export const MAX_UNPACKED = 1 << 30;

export class ZipError extends Error {}

/**
 * Reads one entry of a ZIP archive by its exact name.
 * @param {Uint8Array} bytes
 * @param {string} name
 * @param {{ maxUnpacked?: number }} [options]
 * @returns {Uint8Array | undefined} the entry's bytes, or undefined when the archive has no such entry
 */
export function readEntry(bytes, name, options = {}) {
  const max = options.maxUnpacked ?? MAX_UNPACKED;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end record is in the last 22 bytes plus up to 65,535 of comment.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === END) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ZipError("not a ZIP archive");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== CENTRAL) throw new ZipError("the archive's directory is damaged");
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const packed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    let entryName;
    try {
      entryName = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    } catch {
      entryName = "";
    }
    at += 46 + nameLength + extraLength + commentLength;
    if (entryName !== name) continue;
    if (flags & 1) throw new ZipError(`${name} is encrypted`);
    if (packed === 0xffffffff || size === 0xffffffff || local === 0xffffffff) throw new ZipError(`${name} is too large to read`);
    if (size > max) throw new ZipError(`${name} unpacks to more than ${max} bytes`);
    if (local + 30 > bytes.length || view.getUint32(local, true) !== LOCAL) throw new ZipError(`${name}'s header is damaged`);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + packed);
    if (data.length !== packed) throw new ZipError(`${name} is cut short`);
    let out;
    if (method === 0) out = data;
    else if (method === 8) {
      try {
        out = inflateRawSync(data, { maxOutputLength: max });
      } catch {
        throw new ZipError(`${name} could not be unpacked`);
      }
    } else throw new ZipError(`${name} uses compression method ${method}, not stored or deflate`);
    if (out.length !== size || (crc32(out) >>> 0) !== crc) throw new ZipError(`${name} is damaged (its check sum does not match)`);
    return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
  }
  return undefined;
}

/**
 * Writes a ZIP archive holding one deflated entry. The date is fixed (1980-01-01), so the same entry always makes the
 * same bytes.
 * @param {string} name
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
export function writeSingleEntry(name, data) {
  return writeArchive([{ name, data }]);
}

/**
 * Writes a ZIP archive of several entries, each deflated (method 8, the default) or stored (method 0). For tests of
 * readers; a .pstat writer writes one entry (rule Z2).
 * @param {Array<{ name: string, data: Uint8Array, method?: 0 | 8 }>} entries
 * @returns {Uint8Array}
 */
export function writeArchive(entries) {
  const DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data, method = 8 } of entries) {
    const nameBytes = new TextEncoder().encode(name);
    const packed = method === 8 ? deflateRawSync(data, { level: 9 }) : data;
    const crc = crc32(data) >>> 0;
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, LOCAL, true);
    lv.setUint16(4, 20, true); // version needed: 2.0
    lv.setUint16(8, method, true);
    lv.setUint16(12, DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, packed.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, CENTRAL, true);
    cv.setUint16(4, 20, true); // made by: 2.0, MS-DOS
    cv.setUint16(6, 20, true);
    cv.setUint16(10, method, true);
    cv.setUint16(14, DATE, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, packed.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    locals.push(local, packed);
    centrals.push(central);
    offset += local.length + packed.length;
  }
  const centralLength = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, END, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralLength, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralLength + end.length);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
