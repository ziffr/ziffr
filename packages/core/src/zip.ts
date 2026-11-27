// The ZIP file of a Metric Record (spec 0065; GLOSSARY: Metric Record): a few text files in one file that every
// computer opens. Only what that needs: deflated entries, UTF-8 names, no ZIP64 (the record is bounded far below it).
// Reading ZIPs from outside is not done here or anywhere on the server.
import { crc32, deflateRawSync } from "node:zlib";

/** One file of a ZIP: its path inside it and its contents. */
export type ZipEntry = { name: string; data: Buffer };

/** The most a ZIP without ZIP64 can say about a size, a place or a number of entries. */
const MAX_32 = 0xffffffff;
const MAX_ENTRIES = 0xffff;
const UTF8_NAMES = 0x0800;
const DEFLATE = 8;

/** A day and time as ZIP writes them (the DOS form, in UTC here, to two seconds). */
function dosTime(at: Date): { time: number; date: number } {
  return {
    time: (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | (at.getUTCSeconds() >> 1),
    date: (Math.max(0, at.getUTCFullYear() - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate(),
  };
}

/** The entries as one ZIP file, stamped with the time given. */
export function zipFile(entries: readonly ZipEntry[], at: Date): Buffer {
  if (entries.length > MAX_ENTRIES) throw new Error("Too many files for one ZIP.");
  const { time, date } = dosTime(at);
  const parts: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const packed = deflateRawSync(entry.data);
    if (offset > MAX_32 || entry.data.length > MAX_32) throw new Error("This is too large for one ZIP.");
    // The fields both headers share, from "version needed" to the length of the name.
    const shared = Buffer.alloc(24);
    shared.writeUInt16LE(20, 0);
    shared.writeUInt16LE(UTF8_NAMES, 2);
    shared.writeUInt16LE(DEFLATE, 4);
    shared.writeUInt16LE(time, 6);
    shared.writeUInt16LE(date, 8);
    shared.writeUInt32LE(crc32(entry.data), 10);
    shared.writeUInt32LE(packed.length, 14);
    shared.writeUInt32LE(entry.data.length, 18);
    shared.writeUInt16LE(name.length, 22);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    shared.copy(local, 4);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    shared.copy(central, 6);
    central.writeUInt32LE(offset, 42);
    parts.push(local, name, packed);
    directory.push(central, name);
    offset += local.length + name.length + packed.length;
  }
  const size = directory.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...directory, end]);
}
