import type { CSSProperties } from 'react';

/**
 * สีของกลุ่มวิชา — a fixed palette the ผู้ดูแล picks from, not a free colour
 * picker.
 *
 * A fixed set is what keeps the colour *useful*: every tint below is mixed
 * against the page's own tokens (--card, --border, --foreground), so the same
 * key reads as a soft background in light mode and in dark, and the text on it
 * stays legible. A raw hex typed by hand would be right on one theme and
 * unreadable on the other. Client-safe: no db, no server-only.
 */
export const GROUP_COLORS = [
  { key: 'purple', label: 'ม่วง', hex: '#7c3aed' },
  { key: 'blue', label: 'น้ำเงิน', hex: '#2563eb' },
  { key: 'sky', label: 'ฟ้า', hex: '#0284c7' },
  { key: 'teal', label: 'เขียวน้ำทะเล', hex: '#0d9488' },
  { key: 'green', label: 'เขียว', hex: '#16a34a' },
  { key: 'lime', label: 'เขียวอ่อน', hex: '#65a30d' },
  { key: 'amber', label: 'เหลือง', hex: '#d97706' },
  { key: 'orange', label: 'ส้ม', hex: '#ea580c' },
  { key: 'red', label: 'แดง', hex: '#dc2626' },
  { key: 'pink', label: 'ชมพู', hex: '#db2777' },
  { key: 'brown', label: 'น้ำตาล', hex: '#92400e' },
  { key: 'slate', label: 'เทา', hex: '#475569' },
] as const;

export type GroupColorKey = (typeof GROUP_COLORS)[number]['key'];

export function isGroupColor(v: unknown): v is GroupColorKey {
  return GROUP_COLORS.some((c) => c.key === v);
}

export function groupColorLabel(key: string | null | undefined): string {
  return GROUP_COLORS.find((c) => c.key === key)?.label ?? 'ไม่มีสี';
}

export interface GroupTint {
  /** the solid colour — a swatch, a stripe */
  solid: CSSProperties;
  /** a whole row or card — faint enough to put ordinary text on */
  surface: CSSProperties;
  /** the code tile / badge — stronger tint, tinted text */
  chip: CSSProperties;
  /** text or an icon in the group's colour, legible on the page background */
  ink: CSSProperties;
}

const mix = (hex: string, pct: number, base: string) =>
  `color-mix(in srgb, ${hex} ${pct}%, var(${base}))`;

/**
 * The styles a กลุ่ม's colour paints with, or null when it has none — callers
 * then keep their ordinary look, so a กลุ่ม nobody coloured is not suddenly grey.
 *
 * Ink is mixed toward --foreground rather than used raw: that darkens it on the
 * light theme and lightens it on the dark one, which is what keeps a code like
 * "ET" readable on its tile in both.
 */
export function groupTint(key: string | null | undefined): GroupTint | null {
  const c = GROUP_COLORS.find((x) => x.key === key);
  if (!c) return null;
  const ink = mix(c.hex, 72, '--foreground');
  return {
    solid: { backgroundColor: c.hex },
    surface: {
      backgroundColor: mix(c.hex, 9, '--card'),
      borderColor: mix(c.hex, 38, '--border'),
    },
    chip: { backgroundColor: mix(c.hex, 20, '--card'), color: ink },
    ink: { color: ink },
  };
}
