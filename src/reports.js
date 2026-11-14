// Richer monthly reports & charts (Pro). Reuses periodTotals so the numbers
// match the free «Σύνολο εξόδων» card; that card and the receipt PDF stay free.

import { daysInMonth, periodTotals } from './month-insights.js';
import { shiftMonth } from './features.js';

const r2 = (n) => Math.round(Number(n) * 100) / 100;

export function monthBounds(month) {
  const days = daysInMonth(month);
  if (!days) return null;
  return { from: `${month}-01`, to: `${month}-${String(days).padStart(2, '0')}`, month, days };
}

function weekSlices(month) {
  const bounds = monthBounds(month);
  if (!bounds) return [];
  const slices = [];
  let start = 1;
  while (start <= bounds.days) {
    const end = Math.min(start + 6, bounds.days);
    slices.push({
      from: `${month}-${String(start).padStart(2, '0')}`,
      to: `${month}-${String(end).padStart(2, '0')}`,
      label: `${start}–${end}`
    });
    start = end + 1;
  }
  return slices;
}

export function monthReport(state, month) {
  const bounds = monthBounds(month);
  if (!bounds) return null;
  const current = periodTotals(state, bounds.from, bounds.to);
  const prevMonth = shiftMonth(month, -1);
  const prevBounds = monthBounds(prevMonth);
  const previous = prevBounds ? periodTotals(state, prevBounds.from, prevBounds.to) : { total: 0, rows: [] };
  const weeks = weekSlices(month).map((w) => {
    const totals = periodTotals(state, w.from, w.to);
    return { ...w, total: totals.total, rows: totals.rows };
  });
  const diff = r2(current.total - previous.total);
  const pct = previous.total > 0 ? Math.round((diff / previous.total) * 100) : null;
  const top = [...current.rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  return { month, current, previous, weeks, diff, pct, top };
}

export function svgBars(rows, { width = 320, height = 160, label = (r) => r.label, maxBars = 8 } = {}) {
  const data = (rows || []).filter((r) => r.value > 0).slice(0, maxBars);
  if (!data.length) return '';
  const max = Math.max(...data.map((r) => r.value), 1);
  const padL = 8;
  const padB = 22;
  const padT = 8;
  const gap = 8;
  const innerW = width - padL * 2;
  const innerH = height - padB - padT;
  const bw = (innerW - gap * (data.length - 1)) / data.length;
  const bars = data.map((r, i) => {
    const h = (r.value / max) * innerH;
    const x = padL + i * (bw + gap);
    const y = padT + innerH - h;
    const title = `${label(r)} ${r.value}`;
    return `<g><title>${escapeAttr(title)}</title><rect class="report-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" rx="4"/><text class="report-bar-label" x="${(x + bw / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle">${escapeXml(shorten(label(r)))}</text></g>`;
  }).join('');
  return `<svg class="report-chart" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Ραβδόγραμμα εξόδων">${bars}</svg>`;
}

export function svgWeekLine(weeks, { width = 320, height = 140 } = {}) {
  const data = weeks || [];
  if (data.length < 2) return svgBars(data.map((w) => ({ label: w.label, value: w.total })), { width, height, maxBars: data.length });
  const max = Math.max(...data.map((w) => w.total), 1);
  const pad = 16;
  const innerW = width - pad * 2;
  const innerH = height - 28;
  const pts = data.map((w, i) => {
    const x = pad + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
    const y = 10 + innerH - (w.total / max) * innerH;
    return { x, y, w };
  });
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const dots = pts.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" class="report-dot"><title>${escapeAttr(`${p.w.label}: ${p.w.total}`)}</title></circle>`).join('');
  const labels = pts.map((p) => `<text class="report-bar-label" x="${p.x.toFixed(1)}" y="${height - 6}" text-anchor="middle">${escapeXml(p.w.label)}</text>`).join('');
  return `<svg class="report-chart" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Έξοδα ανά εβδομάδα"><path class="report-line" d="${d}" fill="none"/>${dots}${labels}</svg>`;
}

function shorten(s) {
  const t = String(s || '');
  return t.length > 10 ? `${t.slice(0, 9)}…` : t;
}
function escapeXml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s) {
  return escapeXml(s).replace(/"/g, '&quot;');
}

export const REPORTS_EN = {
  'Αναφορές': 'Reports',
  'Πλήρεις αναφορές και γραφήματα του μήνα. Η κάρτα «Σύνολο εξόδων» και το PDF απόδειξης μένουν δωρεάν.': 'Full monthly reports and charts. The spending totals card and the receipt PDF stay free.',
  'Πλήρεις αναφορές': 'Full reports',
  'Σύγκριση με τον προηγούμενο μήνα': 'Compared with the previous month',
  'Ανά κατηγορία': 'By category',
  'Ανά εβδομάδα': 'By week',
  'Κανένα έξοδο αυτόν τον μήνα ακόμη.': 'No spending this month yet.',
  '▲ {amount} από τον προηγούμενο μήνα': '▲ {amount} from the previous month',
  '▼ {amount} από τον προηγούμενο μήνα': '▼ {amount} from the previous month',
  'Ίδιο με τον προηγούμενο μήνα': 'Same as the previous month',
  'Ραβδόγραμμα εξόδων': 'Spending bar chart',
  'Έξοδα ανά εβδομάδα': 'Spending by week'
};
