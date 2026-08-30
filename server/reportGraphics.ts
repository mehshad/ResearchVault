/**
 * Drawing primitives for generated PDF reports.
 *
 * pdf-lib exposes only rectangles, lines, circles, SVG paths and text, so
 * tables and charts are composed here from those primitives. Everything is
 * vector — no rasterised images — so reports stay small and print sharply.
 *
 * All helpers take an explicit top-left origin and return the y coordinate
 * directly below what they drew, so callers can flow blocks down a page.
 */
import { PDFFont, PDFPage, rgb, type RGB } from "pdf-lib";

export const PAGE = { width: 612, height: 792, margin: 44 } as const;
export const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

export const PALETTE = {
  ink: rgb(0.09, 0.12, 0.18),
  body: rgb(0.27, 0.31, 0.38),
  muted: rgb(0.55, 0.59, 0.65),
  hairline: rgb(0.87, 0.89, 0.91),
  panel: rgb(0.96, 0.97, 0.98),
  accent: rgb(0.05, 0.58, 0.53),
  accentSoft: rgb(0.80, 0.93, 0.91),
  subject: rgb(0.05, 0.58, 0.53),
  peer: rgb(0.72, 0.76, 0.80),
  warn: rgb(0.85, 0.47, 0.10),
  white: rgb(1, 1, 1),
} as const;

export interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

/** Clip a string to a pixel width, adding an ellipsis when it does not fit. */
export function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const value = text ?? "";
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
  let low = 0;
  let high = value.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (font.widthOfTextAtSize(`${value.slice(0, mid)}…`, size) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return `${value.slice(0, low).trimEnd()}…`;
}

/** Greedy word wrap. Returns at most `maxLines` lines, last one ellipsised. */
export function wrap(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
  maxLines = 3,
): string[] {
  const words = (text ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === 0) return [""];
  const consumed = lines.join(" ").split(/\s+/).filter(Boolean).length;
  if (consumed < words.length) {
    lines[lines.length - 1] = fit(`${lines[lines.length - 1]} ${words.slice(consumed).join(" ")}`, font, size, maxWidth);
  }
  return lines;
}

export function drawPageFrame(
  page: PDFPage,
  fonts: Fonts,
  opts: { title: string; subtitle?: string; pageNumber: number; pageCount: number },
): number {
  page.drawRectangle({
    x: 0, y: PAGE.height - 6, width: PAGE.width, height: 6, color: PALETTE.accent,
  });
  page.drawText(opts.title, {
    x: PAGE.margin, y: PAGE.height - 34, size: 9, font: fonts.bold, color: PALETTE.muted,
  });
  if (opts.subtitle) {
    const w = fonts.regular.widthOfTextAtSize(opts.subtitle, 9);
    page.drawText(opts.subtitle, {
      x: PAGE.width - PAGE.margin - w, y: PAGE.height - 34, size: 9, font: fonts.regular, color: PALETTE.muted,
    });
  }
  page.drawLine({
    start: { x: PAGE.margin, y: PAGE.height - 42 },
    end: { x: PAGE.width - PAGE.margin, y: PAGE.height - 42 },
    thickness: 0.75, color: PALETTE.hairline,
  });
  const footer = `Page ${opts.pageNumber} of ${opts.pageCount}`;
  page.drawText(footer, {
    x: PAGE.width / 2 - fonts.regular.widthOfTextAtSize(footer, 8) / 2,
    y: 26, size: 8, font: fonts.regular, color: PALETTE.muted,
  });
  return PAGE.height - 66;
}

export function drawSectionHeading(
  page: PDFPage,
  fonts: Fonts,
  y: number,
  title: string,
  note?: string,
): number {
  page.drawRectangle({ x: PAGE.margin, y: y - 11, width: 3, height: 14, color: PALETTE.accent });
  page.drawText(title, {
    x: PAGE.margin + 10, y: y - 8, size: 12.5, font: fonts.bold, color: PALETTE.ink,
  });
  if (note) {
    const w = fonts.regular.widthOfTextAtSize(note, 8.5);
    page.drawText(note, {
      x: PAGE.width - PAGE.margin - w, y: y - 7, size: 8.5, font: fonts.regular, color: PALETTE.muted,
    });
  }
  return y - 26;
}

export interface Kpi {
  label: string;
  value: string;
  caption?: string;
  emphasis?: boolean;
}

export function drawKpiRow(page: PDFPage, fonts: Fonts, y: number, kpis: Kpi[]): number {
  if (kpis.length === 0) return y;
  const gap = 10;
  const cardWidth = (CONTENT_WIDTH - gap * (kpis.length - 1)) / kpis.length;
  const cardHeight = 58;
  kpis.forEach((kpi, index) => {
    const x = PAGE.margin + index * (cardWidth + gap);
    page.drawRectangle({
      x, y: y - cardHeight, width: cardWidth, height: cardHeight,
      color: kpi.emphasis ? PALETTE.accentSoft : PALETTE.panel,
      borderColor: PALETTE.hairline, borderWidth: 0.75,
    });
    page.drawText(fit(kpi.label.toUpperCase(), fonts.bold, 7, cardWidth - 16), {
      x: x + 8, y: y - 18, size: 7, font: fonts.bold, color: PALETTE.muted,
    });
    page.drawText(fit(kpi.value, fonts.bold, 19, cardWidth - 16), {
      x: x + 8, y: y - 40, size: 19, font: fonts.bold,
      color: kpi.emphasis ? PALETTE.accent : PALETTE.ink,
    });
    if (kpi.caption) {
      page.drawText(fit(kpi.caption, fonts.regular, 7.5, cardWidth - 16), {
        x: x + 8, y: y - 51, size: 7.5, font: fonts.regular, color: PALETTE.body,
      });
    }
  });
  return y - cardHeight - 16;
}

export interface TableColumn {
  header: string;
  width: number;              // fraction of the table width
  align?: "left" | "right";
  bold?: boolean;
}

export function tableHeight(rowCount: number, rowHeight = 15): number {
  return 18 + rowCount * rowHeight + 4;
}

export function drawTable(
  page: PDFPage,
  fonts: Fonts,
  y: number,
  columns: TableColumn[],
  rows: string[][],
  opts: { highlightRow?: (index: number) => boolean; rowHeight?: number; fontSize?: number } = {},
): number {
  const rowHeight = opts.rowHeight ?? 15;
  const fontSize = opts.fontSize ?? 8;
  const totalFraction = columns.reduce((sum, c) => sum + c.width, 0);
  const widths = columns.map((c) => (c.width / totalFraction) * CONTENT_WIDTH);
  const xs: number[] = [];
  let cursor = PAGE.margin;
  for (const width of widths) { xs.push(cursor); cursor += width; }

  page.drawRectangle({
    x: PAGE.margin, y: y - 16, width: CONTENT_WIDTH, height: 18, color: PALETTE.ink,
  });
  columns.forEach((column, i) => {
    const text = fit(column.header.toUpperCase(), fonts.bold, 7, widths[i] - 10);
    const tx = column.align === "right"
      ? xs[i] + widths[i] - 5 - fonts.bold.widthOfTextAtSize(text, 7)
      : xs[i] + 5;
    page.drawText(text, { x: tx, y: y - 11, size: 7, font: fonts.bold, color: PALETTE.white });
  });

  let rowY = y - 16;
  rows.forEach((row, index) => {
    rowY -= rowHeight;
    const highlighted = opts.highlightRow?.(index) ?? false;
    if (highlighted) {
      page.drawRectangle({
        x: PAGE.margin, y: rowY, width: CONTENT_WIDTH, height: rowHeight, color: PALETTE.accentSoft,
      });
    } else if (index % 2 === 1) {
      page.drawRectangle({
        x: PAGE.margin, y: rowY, width: CONTENT_WIDTH, height: rowHeight, color: PALETTE.panel,
      });
    }
    columns.forEach((column, i) => {
      const raw = row[i] ?? "";
      const useBold = column.bold || highlighted;
      const font = useBold ? fonts.bold : fonts.regular;
      const text = fit(raw, font, fontSize, widths[i] - 10);
      const tx = column.align === "right"
        ? xs[i] + widths[i] - 5 - font.widthOfTextAtSize(text, fontSize)
        : xs[i] + 5;
      page.drawText(text, {
        x: tx, y: rowY + rowHeight / 2 - fontSize / 2 + 1, size: fontSize, font,
        color: highlighted ? PALETTE.ink : PALETTE.body,
      });
    });
  });
  page.drawLine({
    start: { x: PAGE.margin, y: rowY }, end: { x: PAGE.width - PAGE.margin, y: rowY },
    thickness: 0.75, color: PALETTE.hairline,
  });
  return rowY - 14;
}

export interface Bar {
  label: string;
  value: number;
  highlight?: boolean;
  caption?: string;
}

/** Vertical column chart — used for output per year. */
export function drawColumnChart(
  page: PDFPage,
  fonts: Fonts,
  y: number,
  bars: Bar[],
  opts: { height?: number; valueLabel?: (v: number) => string; width?: number; x?: number } = {},
): number {
  const height = opts.height ?? 110;
  const width = opts.width ?? CONTENT_WIDTH;
  const originX = opts.x ?? PAGE.margin;
  const baseline = y - height;
  const max = Math.max(1, ...bars.map((b) => b.value));

  // horizontal guides
  for (let step = 0; step <= 2; step++) {
    const gy = baseline + (height * step) / 2;
    page.drawLine({
      start: { x: originX, y: gy }, end: { x: originX + width, y: gy },
      thickness: 0.5, color: PALETTE.hairline,
    });
  }
  if (bars.length === 0) return baseline - 18;

  const slot = width / bars.length;
  const barWidth = Math.min(38, slot * 0.55);
  bars.forEach((bar, index) => {
    const cx = originX + slot * index + slot / 2;
    const barHeight = Math.max(1, (bar.value / max) * (height - 14));
    page.drawRectangle({
      x: cx - barWidth / 2, y: baseline, width: barWidth, height: barHeight,
      color: bar.highlight ? PALETTE.accent : PALETTE.peer,
    });
    const valueText = opts.valueLabel ? opts.valueLabel(bar.value) : String(bar.value);
    page.drawText(valueText, {
      x: cx - fonts.bold.widthOfTextAtSize(valueText, 7.5) / 2,
      y: baseline + barHeight + 3, size: 7.5, font: fonts.bold, color: PALETTE.ink,
    });
    const label = fit(bar.label, fonts.regular, 7.5, slot - 2);
    page.drawText(label, {
      x: cx - fonts.regular.widthOfTextAtSize(label, 7.5) / 2,
      y: baseline - 11, size: 7.5, font: fonts.regular, color: PALETTE.body,
    });
  });
  return baseline - 24;
}

/** Horizontal bars — used for per-publication contribution and peer ranking. */
export function drawHorizontalBars(
  page: PDFPage,
  fonts: Fonts,
  y: number,
  bars: Bar[],
  opts: { labelWidth?: number; rowHeight?: number; valueLabel?: (v: number) => string } = {},
): number {
  const labelWidth = opts.labelWidth ?? 210;
  const rowHeight = opts.rowHeight ?? 16;
  const max = Math.max(1, ...bars.map((b) => b.value));
  const trackX = PAGE.margin + labelWidth + 6;
  const trackWidth = CONTENT_WIDTH - labelWidth - 52;
  let rowY = y;
  for (const bar of bars) {
    rowY -= rowHeight;
    page.drawText(fit(bar.label, bar.highlight ? fonts.bold : fonts.regular, 8, labelWidth), {
      x: PAGE.margin, y: rowY + 4, size: 8,
      font: bar.highlight ? fonts.bold : fonts.regular,
      color: bar.highlight ? PALETTE.ink : PALETTE.body,
    });
    page.drawRectangle({
      x: trackX, y: rowY + 2, width: trackWidth, height: 9, color: PALETTE.panel,
    });
    page.drawRectangle({
      x: trackX, y: rowY + 2, width: Math.max(1, (bar.value / max) * trackWidth), height: 9,
      color: bar.highlight ? PALETTE.accent : PALETTE.peer,
    });
    const valueText = opts.valueLabel ? opts.valueLabel(bar.value) : String(bar.value);
    page.drawText(valueText, {
      x: trackX + trackWidth + 6, y: rowY + 4, size: 7.5,
      font: bar.highlight ? fonts.bold : fonts.regular, color: PALETTE.ink,
    });
  }
  return rowY - 12;
}

/**
 * Distribution histogram with the subject's bin picked out — the core visual
 * for "where does this person sit among peers".
 */
export function drawHistogram(
  page: PDFPage,
  fonts: Fonts,
  y: number,
  bins: Array<{ label: string; count: number; containsSubject: boolean }>,
  opts: { height?: number; caption?: string } = {},
): number {
  const height = opts.height ?? 96;
  const baseline = y - height;
  const max = Math.max(1, ...bins.map((b) => b.count));
  if (bins.length === 0) return baseline - 16;
  const slot = CONTENT_WIDTH / bins.length;
  const barWidth = slot * 0.72;

  bins.forEach((bin, index) => {
    const cx = PAGE.margin + slot * index + slot / 2;
    const barHeight = Math.max(1.5, (bin.count / max) * (height - 16));
    page.drawRectangle({
      x: cx - barWidth / 2, y: baseline, width: barWidth, height: barHeight,
      color: bin.containsSubject ? PALETTE.accent : PALETTE.peer,
    });
    if (bin.count > 0) {
      const t = String(bin.count);
      page.drawText(t, {
        x: cx - fonts.regular.widthOfTextAtSize(t, 7) / 2,
        y: baseline + barHeight + 3, size: 7, font: fonts.regular, color: PALETTE.muted,
      });
    }
    if (bin.containsSubject) {
      page.drawText("YOU", {
        x: cx - fonts.bold.widthOfTextAtSize("YOU", 7) / 2,
        y: baseline + barHeight + 12, size: 7, font: fonts.bold, color: PALETTE.accent,
      });
    }
    const label = fit(bin.label, fonts.regular, 6.5, slot - 1);
    page.drawText(label, {
      x: cx - fonts.regular.widthOfTextAtSize(label, 6.5) / 2,
      y: baseline - 10, size: 6.5, font: fonts.regular, color: PALETTE.body,
    });
  });
  page.drawLine({
    start: { x: PAGE.margin, y: baseline }, end: { x: PAGE.width - PAGE.margin, y: baseline },
    thickness: 0.75, color: PALETTE.hairline,
  });
  let out = baseline - 22;
  if (opts.caption) {
    page.drawText(opts.caption, {
      x: PAGE.margin, y: out, size: 7.5, font: fonts.regular, color: PALETTE.muted,
    });
    out -= 12;
  }
  return out;
}

/**
 * Percentile band: a continuous track with quartile ticks and a marker where
 * the subject falls. Communicates position far faster than a number.
 */
export function drawPercentileBand(
  page: PDFPage,
  fonts: Fonts,
  y: number,
  percentile: number,
  opts: { leftLabel?: string; rightLabel?: string; markerLabel?: string } = {},
): number {
  const trackY = y - 16;
  const trackHeight = 10;
  page.drawRectangle({
    x: PAGE.margin, y: trackY, width: CONTENT_WIDTH, height: trackHeight, color: PALETTE.panel,
  });
  const clamped = Math.max(0, Math.min(100, percentile));
  page.drawRectangle({
    x: PAGE.margin, y: trackY, width: (clamped / 100) * CONTENT_WIDTH, height: trackHeight,
    color: PALETTE.accentSoft,
  });
  for (const q of [25, 50, 75]) {
    const qx = PAGE.margin + (q / 100) * CONTENT_WIDTH;
    page.drawLine({
      start: { x: qx, y: trackY }, end: { x: qx, y: trackY + trackHeight },
      thickness: 0.75, color: PALETTE.muted,
    });
    const t = `P${q}`;
    page.drawText(t, {
      x: qx - fonts.regular.widthOfTextAtSize(t, 6.5) / 2,
      y: trackY - 10, size: 6.5, font: fonts.regular, color: PALETTE.muted,
    });
  }
  const markerX = PAGE.margin + (clamped / 100) * CONTENT_WIDTH;
  page.drawRectangle({
    x: markerX - 1.5, y: trackY - 3, width: 3, height: trackHeight + 6, color: PALETTE.accent,
  });
  if (opts.markerLabel) {
    const w = fonts.bold.widthOfTextAtSize(opts.markerLabel, 8);
    const lx = Math.min(Math.max(PAGE.margin, markerX - w / 2), PAGE.width - PAGE.margin - w);
    page.drawText(opts.markerLabel, {
      x: lx, y: trackY + trackHeight + 5, size: 8, font: fonts.bold, color: PALETTE.accent,
    });
  }
  if (opts.leftLabel) {
    page.drawText(opts.leftLabel, {
      x: PAGE.margin, y: trackY - 20, size: 7, font: fonts.regular, color: PALETTE.muted,
    });
  }
  if (opts.rightLabel) {
    const w = fonts.regular.widthOfTextAtSize(opts.rightLabel, 7);
    page.drawText(opts.rightLabel, {
      x: PAGE.width - PAGE.margin - w, y: trackY - 20, size: 7, font: fonts.regular, color: PALETTE.muted,
    });
  }
  return trackY - 34;
}

/**
 * Proportional stacked bar for a categorical mix (authorship roles).
 * Chosen over a donut deliberately: a single horizontal band keeps small
 * slices legible in print and needs no arc geometry, so it degrades
 * predictably when one category dominates.
 */
export function drawStackedBar(
  page: PDFPage,
  fonts: Fonts,
  y: number,
  slices: Array<{ label: string; value: number; color: RGB }>,
  opts: { width?: number; x?: number; height?: number } = {},
): number {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const width = opts.width ?? CONTENT_WIDTH;
  const height = opts.height ?? 22;
  const x0 = opts.x ?? PAGE.margin;
  if (total <= 0) return y - height - 10;

  let cursor = x0;
  for (const slice of slices) {
    if (slice.value <= 0) continue;
    const segment = (slice.value / total) * width;
    page.drawRectangle({ x: cursor, y: y - height, width: segment, height, color: slice.color });
    const pct = Math.round((slice.value / total) * 100);
    const label = `${pct}%`;
    // Only label segments wide enough to hold the text without overlapping.
    if (segment > fonts.bold.widthOfTextAtSize(label, 8) + 8) {
      page.drawText(label, {
        x: cursor + segment / 2 - fonts.bold.widthOfTextAtSize(label, 8) / 2,
        y: y - height / 2 - 3, size: 8, font: fonts.bold, color: PALETTE.white,
      });
    }
    cursor += segment;
  }
  page.drawRectangle({
    x: x0, y: y - height, width, height,
    borderColor: PALETTE.hairline, borderWidth: 0.75, color: undefined as any,
  });
  return y - height - 12;
}

export function drawLegend(
  page: PDFPage,
  fonts: Fonts,
  x: number,
  y: number,
  items: Array<{ label: string; color: RGB; value?: string }>,
  maxWidth = 150,
): number {
  let cursor = y;
  for (const item of items) {
    page.drawRectangle({ x, y: cursor - 6, width: 8, height: 8, color: item.color });
    page.drawText(fit(item.label, fonts.regular, 8, maxWidth - 40), {
      x: x + 13, y: cursor - 5, size: 8, font: fonts.regular, color: PALETTE.body,
    });
    if (item.value) {
      const w = fonts.bold.widthOfTextAtSize(item.value, 8);
      page.drawText(item.value, {
        x: x + maxWidth - w, y: cursor - 5, size: 8, font: fonts.bold, color: PALETTE.ink,
      });
    }
    cursor -= 15;
  }
  return cursor;
}

export function drawCallout(
  page: PDFPage,
  fonts: Fonts,
  y: number,
  title: string,
  lines: string[],
): number {
  const bodyHeight = 16 + lines.length * 11;
  page.drawRectangle({
    x: PAGE.margin, y: y - bodyHeight, width: CONTENT_WIDTH, height: bodyHeight,
    color: PALETTE.panel, borderColor: PALETTE.hairline, borderWidth: 0.75,
  });
  page.drawRectangle({ x: PAGE.margin, y: y - bodyHeight, width: 3, height: bodyHeight, color: PALETTE.accent });
  page.drawText(title, {
    x: PAGE.margin + 10, y: y - 13, size: 8.5, font: fonts.bold, color: PALETTE.ink,
  });
  lines.forEach((line, i) => {
    page.drawText(fit(line, fonts.regular, 8, CONTENT_WIDTH - 22), {
      x: PAGE.margin + 10, y: y - 26 - i * 11, size: 8, font: fonts.regular, color: PALETTE.body,
    });
  });
  return y - bodyHeight - 14;
}
