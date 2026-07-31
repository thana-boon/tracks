import 'server-only';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as fontkit from 'fontkit';
import { Font, StyleSheet } from '@react-pdf/renderer';

// Register the Thai families when their TTFs are present (copy-fonts.mjs).
//
// This module is the single place fonts are registered — every PDF document
// imports a family constant from here rather than calling Font.register again,
// so a second document can never race the first with a different set of weights.
const FONT_DIR = join(process.cwd(), 'public', 'fonts');

/**
 * Register `family` from three weight files, skipping any that did not
 * download. Returns the family name, or 'Helvetica' when even Regular is
 * missing — a Latin fallback beats a render that throws.
 */
function register(family: string, prefix: string): string {
  const file = (weight: string) => join(FONT_DIR, `${prefix}-${weight}.ttf`);
  const regular = file('Regular');
  if (!existsSync(regular)) return 'Helvetica';
  Font.register({
    family,
    fonts: [
      { src: regular, fontWeight: 400 },
      ...(existsSync(file('SemiBold')) ? [{ src: file('SemiBold'), fontWeight: 600 }] : []),
      ...(existsSync(file('Bold')) ? [{ src: file('Bold'), fontWeight: 700 }] : []),
    ],
  });
  return family;
}

const family = register('Plex Thai', 'IBMPlexSansThai');

/** Working documents — ใบเช็คชื่อ, รายงานห้องที่ปรึกษา. */
export const FONT_FAMILY = family;

/**
 * Official, signed documents — ทรานสคริปต์. Sarabun is the standard Thai
 * government document face, which is what a transcript carrying the ผอ.'s
 * signature is expected to be set in.
 */
export const DOC_FONT_FAMILY = register('Sarabun', 'Sarabun');

/**
 * Thai combining marks: สระบน/สระล่าง and วรรณยุกต์. They have no width of
 * their own and must stay attached to the consonant they sit on, so they can
 * never start a line.
 */
const THAI_COMBINING = /[ัิ-ฺ็-๎]/;

/**
 * Last-resort line breaking for Thai.
 *
 * @react-pdf only ever breaks a line at a space, and Thai is written without
 * them — so a long ชื่อวิชา is a single unbreakable "word" that runs straight
 * out of its cell and prints on top of whatever is beside it. This hands the
 * layout engine one part per character cluster so it can wrap instead.
 *
 * It is a backstop, not the plan: @react-pdf draws a literal "-" at every break
 * it takes here (textkit inserts HYPHEN whenever a line ends on a penalty
 * node), and Thai does not hyphenate. Callers that care — the transcript — use
 * `fitFontSize` so the text fits on one line and this never fires. The 20-char
 * floor keeps it away from ordinary names in the other documents.
 */
Font.registerHyphenationCallback((word) => {
  if (word.length < 20 || !/[฀-๿]/.test(word)) return [word];
  const clusters: string[] = [];
  for (const ch of word) {
    if (clusters.length > 0 && THAI_COMBINING.test(ch)) clusters[clusters.length - 1] += ch;
    else clusters.push(ch);
  }
  return clusters;
});

/** Sarabun opened for measurement — the same file @react-pdf lays text with. */
const docFont = (() => {
  const file = join(FONT_DIR, 'Sarabun-Regular.ttf');
  if (!existsSync(file)) return null;
  try {
    const f = fontkit.openSync(file);
    return 'unitsPerEm' in f ? (f as fontkit.Font) : null;
  } catch {
    return null;
  }
})();

/** Width of `text` set in the document font at `size`, in points. */
export function textWidth(text: string, size: number): number {
  if (!docFont) return text.length * size * 0.5; // Helvetica fallback: rough is fine
  return (docFont.layout(text).advanceWidth / docFont.unitsPerEm) * size;
}

/**
 * The largest size at or below `base` that fits every one of `texts` inside
 * `maxWidth`, never going below `min`.
 *
 * Used instead of wrapping so a table row stays exactly one line tall: the
 * page-fits-on-one-sheet calculation is built on a known row height, and a
 * ชื่อวิชา that silently became two lines would break it. Sizing the whole
 * column together rather than per row keeps the table typographically even.
 */
export function fitFontSize(
  texts: string[],
  maxWidth: number,
  base: number,
  min: number,
): number {
  let size = base;
  while (size > min) {
    if (texts.every((t) => textWidth(t, size) <= maxWidth)) return size;
    size -= 0.25;
  }
  return min;
}

export const PURPLE = '#5b2d8e';
export const GOLD = '#f5c518';
export const INK = '#1a1625';
export const MUTED = '#6b6478';
export const LINE = '#d9d2e6';

/**
 * Guard against @react-pdf/renderer eating the last glyph of a Thai run: a
 * trailing space gets consumed instead of the last character. Invisible in a
 * left-aligned cell, costs nothing. Applied to DB-sourced values.
 */
export function thai(value: string): string {
  return /[฀-๿]/.test(value) ? `${value} ` : value;
}

/** Shared page furniture every document draws the same way. */
export const base = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 44,
    paddingHorizontal: 40,
    fontFamily: family,
    fontSize: 10,
    color: INK,
  },
  h1: { fontSize: 15, fontWeight: 700 },
  h2: { fontSize: 11, fontWeight: 600 },
  muted: { color: MUTED, fontSize: 9 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    color: MUTED,
    fontSize: 8,
  },
});
