import 'server-only';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Font, StyleSheet } from '@react-pdf/renderer';

// Register IBM Plex Sans Thai when the TTFs are present (copy-fonts.mjs).
//
// This module is the single place the font is registered — every PDF document
// imports FONT_FAMILY from here rather than calling Font.register again, so a
// second document can never race the first with a different set of weights.
const FONT_DIR = join(process.cwd(), 'public', 'fonts');
let family = 'Helvetica';
const reg = join(FONT_DIR, 'IBMPlexSansThai-Regular.ttf');
if (existsSync(reg)) {
  Font.register({
    family: 'Plex Thai',
    fonts: [
      { src: reg, fontWeight: 400 },
      ...(existsSync(join(FONT_DIR, 'IBMPlexSansThai-SemiBold.ttf'))
        ? [{ src: join(FONT_DIR, 'IBMPlexSansThai-SemiBold.ttf'), fontWeight: 600 }]
        : []),
      ...(existsSync(join(FONT_DIR, 'IBMPlexSansThai-Bold.ttf'))
        ? [{ src: join(FONT_DIR, 'IBMPlexSansThai-Bold.ttf'), fontWeight: 700 }]
        : []),
    ],
  });
  family = 'Plex Thai';
}

export const FONT_FAMILY = family;

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
