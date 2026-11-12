// Minimal PDF 1.4 writer: embeds a TTF as an Identity-H Type0 font so Greek (and Latin) text
// can be written entirely on-device, with no network call. Used by the receipts export.

const U16 = (b, i) => (b[i] << 8) | b[i + 1];
const I16 = (b, i) => { const v = U16(b, i); return v & 0x8000 ? v - 0x10000 : v; };
const U32 = (b, i) => ((b[i] * 0x1000000) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]) >>> 0;

function table(buf, tag) {
  const n = U16(buf, 4);
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    if (String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]) === tag) {
      const off = U32(buf, o + 8), len = U32(buf, o + 12);
      return buf.subarray(off, off + len);
    }
  }
  return null;
}

function parseCmap(buf) {
  const cmap = table(buf, 'cmap');
  if (!cmap) throw new Error('font: no cmap');
  const num = U16(cmap, 2);
  let best = null;
  for (let i = 0; i < num; i++) {
    const plat = U16(cmap, 4 + i * 8), enc = U16(cmap, 6 + i * 8), off = U32(cmap, 8 + i * 8);
    const fmt = U16(cmap, off);
    // Prefer Unicode (plat 0, or plat 3/enc 1 or 10).
    if (fmt === 4 && (plat === 0 || (plat === 3 && enc === 1))) best = { fmt, off, score: 2 };
    if (fmt === 12 && (plat === 0 || (plat === 3 && enc === 10)) && (!best || best.score < 3)) best = { fmt, off, score: 3 };
  }
  if (!best) throw new Error('font: no unicode cmap');
  const map = new Map();
  if (best.fmt === 4) {
    const off = best.off;
    const segCount = U16(cmap, off + 6) / 2;
    const endO = off + 14;
    const startO = endO + segCount * 2 + 2;
    const deltaO = startO + segCount * 2;
    const rangeO = deltaO + segCount * 2;
    for (let i = 0; i < segCount; i++) {
      const end = U16(cmap, endO + i * 2);
      const start = U16(cmap, startO + i * 2);
      const delta = I16(cmap, deltaO + i * 2);
      const range = U16(cmap, rangeO + i * 2);
      for (let c = start; c <= end; c++) {
        let gid;
        if (range === 0) gid = (c + delta) & 0xffff;
        else {
          const p = rangeO + i * 2 + range + (c - start) * 2;
          const g = U16(cmap, p);
          gid = g ? (g + delta) & 0xffff : 0;
        }
        if (gid) map.set(c, gid);
      }
    }
  } else {
    const nGroups = U32(cmap, best.off + 12);
    let p = best.off + 16;
    for (let i = 0; i < nGroups; i++, p += 12) {
      const start = U32(cmap, p), end = U32(cmap, p + 4), gid = U32(cmap, p + 8);
      for (let c = start; c <= end; c++) map.set(c, gid + (c - start));
    }
  }
  return map;
}

export function loadTtf(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const head = table(buf, 'head');
  const hhea = table(buf, 'hhea');
  const hmtx = table(buf, 'hmtx');
  const os2 = table(buf, 'OS/2');
  const maxp = table(buf, 'maxp');
  if (!head || !hhea || !hmtx || !maxp) throw new Error('font: missing table');
  const units = U16(head, 18) || 1000;
  const xMin = I16(head, 36), yMin = I16(head, 38), xMax = I16(head, 40), yMax = I16(head, 42);
  const ascent = I16(hhea, 4), descent = I16(hhea, 6);
  const numH = U16(hhea, 34);
  const numGlyphs = U16(maxp, 4);
  const scale = 1000 / units;
  const widths = new Array(numGlyphs);
  for (let i = 0; i < numGlyphs; i++) {
    const idx = i < numH ? i : numH - 1;
    widths[i] = Math.round(U16(hmtx, idx * 4) * scale);
  }
  const capHeight = os2 && os2.length >= 44 ? Math.round(I16(os2, 42) * scale) : Math.round(ascent * scale);
  const cmap = parseCmap(buf);
  return {
    bytes: buf,
    units,
    bbox: [Math.round(xMin * scale), Math.round(yMin * scale), Math.round(xMax * scale), Math.round(yMax * scale)],
    ascent: Math.round(ascent * scale),
    descent: Math.round(descent * scale),
    capHeight,
    widths,
    cmap,
    glyphId(ch) { return cmap.get(ch) || cmap.get(63) || 0; }, // missing → '?'
    widthOf(text, size) {
      let w = 0;
      for (const ch of text) {
        const cp = ch.codePointAt(0);
        w += this.widths[this.glyphId(cp)] || 0;
        if (cp > 0xffff) { /* skip trailing surrogate already handled by for-of */ }
      }
      return (w * size) / 1000;
    }
  };
}

function pdfEscapeName(s) { return `/${s.replace(/[^\w]/g, '')}`; }

function toUnicodeCmap(font, used) {
  const lines = [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange <0000> <FFFF> endcodespacerange'
  ];
  const pairs = [];
  for (const [cp, gid] of font.cmap) {
    if (!used.has(gid)) continue;
    pairs.push([gid, cp]);
  }
  pairs.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < pairs.length; i += 100) {
    const chunk = pairs.slice(i, i + 100);
    lines.push(`${chunk.length} beginbfchar`);
    for (const [gid, cp] of chunk) {
      const g = gid.toString(16).toUpperCase().padStart(4, '0');
      const c = cp.toString(16).toUpperCase().padStart(cp > 0xffff ? 8 : 4, '0');
      lines.push(`<${g}> <${c}>`);
    }
    lines.push('endbfchar');
  }
  lines.push('endcmap CMapName currentdict /CMap defineresource pop end end');
  return lines.join('\n');
}

function hexGlyphs(font, text, used) {
  let hex = '';
  for (const ch of text) {
    const gid = font.glyphId(ch.codePointAt(0));
    if (gid) used.add(gid);
    hex += gid.toString(16).toUpperCase().padStart(4, '0');
  }
  return hex;
}

function pdfLiteral(str) {
  return `(${String(str).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`;
}

// Build a one-or-more-page A4 PDF from a list of draw commands.
// commands: { type:'text', x, y, size, text, bold } | { type:'line', x1,y1,x2,y2 } | { type:'page' }
// x/y are in PDF points from the bottom-left of the current page; the helper below uses a top-down cursor.
export const A4 = { width: 595.28, height: 841.89 };

export function wrapText(font, text, size, maxWidth) {
  const words = String(text || '').split(/(\s+)/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur + w;
    if (cur && font.widthOf(next, size) > maxWidth && w.trim()) {
      lines.push(cur.replace(/\s+$/, ''));
      cur = w.replace(/^\s+/, '');
    } else cur = next;
  }
  if (cur) lines.push(cur.replace(/\s+$/, ''));
  return lines.length ? lines : [''];
}

export function writePdf(font, pages, { title = 'Spitothiki', author = 'Spitothiki' } = {}) {
  const used = new Set([0]);
  const contentStreams = pages.map((ops) => {
    const out = ['0 g', '0 G', '0.6 w'];
    for (const op of ops) {
      if (op.type === 'text') {
        const hex = hexGlyphs(font, op.text, used);
        if (!hex) continue;
        const x = op.x.toFixed(2), y = op.y.toFixed(2), s = op.size.toFixed(2);
        out.push(`BT /F1 ${s} Tf 1 0 0 1 ${x} ${y} Tm <${hex}> Tj ET`);
      } else if (op.type === 'line') {
        out.push(`${op.x1.toFixed(2)} ${op.y1.toFixed(2)} m ${op.x2.toFixed(2)} ${op.y2.toFixed(2)} l S`);
      }
    }
    return out.join('\n');
  });

  // Assemble objects by reserved names, then emit in order.
  const parts = [];
  const idOf = {};
  const reserve = (name) => { idOf[name] = parts.length + 1; parts.push(null); return idOf[name]; };
  const set = (name, body) => { parts[idOf[name] - 1] = body; };

  reserve('catalog');
  reserve('pages');
  const pageIds = pages.map((_, i) => reserve(`page${i}`));
  const contentIds = pages.map((_, i) => reserve(`content${i}`));
  reserve('font0');
  reserve('cid');
  reserve('desc');
  reserve('file');
  reserve('touni');
  reserve('info');

  const fontFile = font.bytes;
  const wChunks = [];
  // Compact /W array: runs of glyph ids
  const gids = [...used].filter((g) => g > 0).sort((a, b) => a - b);
  let i = 0;
  while (i < gids.length) {
    const start = gids[i];
    const widths = [font.widths[start] || 0];
    i += 1;
    while (i < gids.length && gids[i] === gids[i - 1] + 1) { widths.push(font.widths[gids[i]] || 0); i += 1; }
    wChunks.push(`${start} [${widths.join(' ')}]`);
  }

  const bbox = font.bbox.join(' ');
  set('file', { stream: fontFile, dict: `/Length ${fontFile.length} /Length1 ${fontFile.length}` });
  const touni = toUnicodeCmap(font, used);
  set('touni', { stream: touni, dict: `/Length ${touni.length}` });
  set('desc', `<< /Type /FontDescriptor /FontName /PdfSans /Flags 32 /FontBBox [${bbox}] /ItalicAngle 0 /Ascent ${font.ascent} /Descent ${font.descent} /CapHeight ${font.capHeight} /StemV 80 /FontFile2 ${idOf.file} 0 R >>`);
  set('cid', `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /PdfSans /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${idOf.desc} 0 R /W [${wChunks.join(' ')}] /CIDToGIDMap /Identity >>`);
  set('font0', `<< /Type /Font /Subtype /Type0 /BaseFont /PdfSans /Encoding /Identity-H /DescendantFonts [${idOf.cid} 0 R] /ToUnicode ${idOf.touni} 0 R >>`);

  for (let p = 0; p < pages.length; p++) {
    const stream = contentStreams[p];
    set(`content${p}`, { stream, dict: `/Length ${stream.length}` });
    set(`page${p}`, `<< /Type /Page /Parent ${idOf.pages} 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] /Resources << /Font << /F1 ${idOf.font0} 0 R >> >> /Contents ${idOf[`content${p}`]} 0 R >>`);
  }
  set('pages', `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  set('catalog', `<< /Type /Catalog /Pages ${idOf.pages} 0 R >>`);
  set('info', `<< /Title ${pdfLiteral(title)} /Author ${pdfLiteral(author)} /Creator ${pdfLiteral('Spitothiki')} /Producer ${pdfLiteral('Spitothiki')} >>`);

  const encoder = new TextEncoder();
  const chunks = [encoder.encode('%PDF-1.4\n%\x80\x80\x80\x80\n')];
  const offsets = [0];
  let pos = chunks[0].length;
  const push = (u8) => { chunks.push(u8); pos += u8.length; };

  for (let n = 1; n <= parts.length; n++) {
    offsets[n] = pos;
    const body = parts[n - 1];
    if (body && typeof body === 'object' && body.stream != null) {
      const data = typeof body.stream === 'string' ? encoder.encode(body.stream) : body.stream;
      // Recompute length in case TextEncoder changed it (UTF-8 ToUnicode is ASCII-only so same).
      const header = encoder.encode(`${n} 0 obj\n<< ${body.dict.replace(/\/Length \d+/, `/Length ${data.length}`)} >>\nstream\n`);
      push(header);
      push(data);
      push(encoder.encode('\nendstream\nendobj\n'));
    } else {
      push(encoder.encode(`${n} 0 obj\n${body}\nendobj\n`));
    }
  }
  const xrefPos = pos;
  let xref = `xref\n0 ${parts.length + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= parts.length; n++) xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(encoder.encode(xref));
  push(encoder.encode(`trailer\n<< /Size ${parts.length + 1} /Root ${idOf.catalog} 0 R /Info ${idOf.info} 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`));

  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

