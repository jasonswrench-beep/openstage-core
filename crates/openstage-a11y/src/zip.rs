//! Reads the entries of a ZIP archive (an EPUB, a Word or a PowerPoint file): stored and deflated entries, with
//! limits on how many there are and how large each grows when unpacked. ZIP64 and encrypted entries are not read.

use flate2::read::DeflateDecoder;
use std::cell::Cell;
use std::collections::BTreeMap;
use std::io::Read;

pub const MAX_ENTRIES: usize = 20_000;
pub const MAX_ENTRY: u64 = 128 * 1024 * 1024;
pub const MAX_TOTAL: u64 = 1024 * 1024 * 1024;

#[derive(Debug, Clone)]
struct Entry {
    method: u16,
    flags: u16,
    packed: u64,
    size: u64,
    offset: u64,
}

pub struct Zip<'a> {
    bytes: &'a [u8],
    entries: BTreeMap<String, Entry>,
    names: Vec<String>,
    unpacked: Cell<u64>,
}

fn u16_at(b: &[u8], i: usize) -> Option<u16> {
    b.get(i..i + 2).map(|s| u16::from_le_bytes([s[0], s[1]]))
}
fn u32_at(b: &[u8], i: usize) -> Option<u32> {
    b.get(i..i + 4).map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
}

impl<'a> Zip<'a> {
    pub fn open(bytes: &'a [u8]) -> Result<Zip<'a>, String> {
        let min = bytes.len().saturating_sub(22 + 65_535);
        let end = (min..bytes.len().saturating_sub(21)).rev().find(|&i| u32_at(bytes, i) == Some(0x0605_4b50)).ok_or("it is not a ZIP file (no end record)")?;
        let count = u16_at(bytes, end + 10).ok_or("the end record is cut short")? as usize;
        let cd_offset = u32_at(bytes, end + 16).ok_or("the end record is cut short")? as usize;
        if count == 0xFFFF || cd_offset == 0xFFFF_FFFF {
            return Err("it is a ZIP64 archive, which this check does not read".into());
        }
        if count > MAX_ENTRIES {
            return Err(format!("it has {count} entries, more than {MAX_ENTRIES}"));
        }
        let mut entries = BTreeMap::new();
        let mut names = Vec::new();
        let mut p = cd_offset;
        for _ in 0..count {
            if u32_at(bytes, p) != Some(0x0201_4b50) {
                return Err("its list of entries is damaged".into());
            }
            let flags = u16_at(bytes, p + 8).ok_or("cut short")?;
            let method = u16_at(bytes, p + 10).ok_or("cut short")?;
            let packed = u32_at(bytes, p + 20).ok_or("cut short")? as u64;
            let size = u32_at(bytes, p + 24).ok_or("cut short")? as u64;
            let name_len = u16_at(bytes, p + 28).ok_or("cut short")? as usize;
            let extra_len = u16_at(bytes, p + 30).ok_or("cut short")? as usize;
            let comment_len = u16_at(bytes, p + 32).ok_or("cut short")? as usize;
            let offset = u32_at(bytes, p + 42).ok_or("cut short")? as u64;
            let name_bytes = bytes.get(p + 46..p + 46 + name_len).ok_or("an entry's name is cut short")?;
            let name = String::from_utf8_lossy(name_bytes).replace('\\', "/");
            if !entries.contains_key(&name) {
                names.push(name.clone());
                entries.insert(name, Entry { method, flags, packed, size, offset });
            }
            p += 46 + name_len + extra_len + comment_len;
        }
        Ok(Zip { bytes, entries, names, unpacked: Cell::new(0) })
    }

    /// The entries' names, in the archive's order.
    pub fn names(&self) -> &[String] {
        &self.names
    }

    pub fn has(&self, name: &str) -> bool {
        self.entries.contains_key(name)
    }

    /// The first entry's name, as stored (an EPUB's `mimetype` must come first).
    pub fn first(&self) -> Option<&str> {
        self.names.first().map(String::as_str)
    }

    /// An entry unpacked, or why it cannot be.
    pub fn read(&self, name: &str) -> Result<Vec<u8>, String> {
        let e = self.entries.get(name).ok_or_else(|| format!("{name} is not in the archive"))?;
        if e.flags & 1 != 0 {
            return Err(format!("{name} is encrypted"));
        }
        if e.size > MAX_ENTRY {
            return Err(format!("{name} unpacks to more than {} MB", MAX_ENTRY / (1024 * 1024)));
        }
        if self.unpacked.get() + e.size > MAX_TOTAL {
            return Err(format!("the archive unpacks to more than {} MB in all", MAX_TOTAL / (1024 * 1024)));
        }
        self.unpacked.set(self.unpacked.get() + e.size);
        let at = e.offset as usize;
        if u32_at(self.bytes, at) != Some(0x0403_4b50) {
            return Err(format!("{name}'s header is damaged"));
        }
        let name_len = u16_at(self.bytes, at + 26).ok_or("cut short")? as usize;
        let extra_len = u16_at(self.bytes, at + 28).ok_or("cut short")? as usize;
        let start = at + 30 + name_len + extra_len;
        let data = self.bytes.get(start..start + e.packed as usize).ok_or_else(|| format!("{name} is cut short"))?;
        match e.method {
            0 => Ok(data.to_vec()),
            8 => {
                let mut out = Vec::with_capacity(e.size.min(MAX_ENTRY) as usize);
                let mut dec = DeflateDecoder::new(data).take(MAX_ENTRY + 1);
                dec.read_to_end(&mut out).map_err(|err| format!("{name} cannot be unpacked: {err}"))?;
                if out.len() as u64 > MAX_ENTRY {
                    return Err(format!("{name} unpacks to more than {} MB", MAX_ENTRY / (1024 * 1024)));
                }
                Ok(out)
            }
            m => Err(format!("{name} is packed in a way this check does not read (method {m})")),
        }
    }

    /// An entry as text (UTF-8, a byte order mark left out).
    pub fn text(&self, name: &str) -> Result<String, String> {
        let b = self.read(name)?;
        Ok(crate::text_of(&b))
    }
}
