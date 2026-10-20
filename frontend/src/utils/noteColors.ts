import { contrastRatio, parseCssColor } from './contrast';

// WCAG 1.4.11: non-text UI (a border) needs 3:1 against its background
const MIN_BORDER_CONTRAST = 3;

/*
 * Mid-tone colours instead of pastels: each one reaches at least 3:1 against
 * the light and the dark sidebar background, so the same swatch and stripe
 * work in both themes. White is not a colour here; it means "no colour".
 */
export const NOTE_COLORS = [
  { name: 'Red', value: '#EF4444' },
  { name: 'Orange', value: '#EA580C' },
  { name: 'Amber', value: '#D97706' },
  { name: 'Green', value: '#16A34A' },
  { name: 'Teal', value: '#0D9488' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Indigo', value: '#6366F1' },
  { name: 'Violet', value: '#8B5CF6' },
  { name: 'Pink', value: '#EC4899' },
];

export const DEFAULT_NOTE_COLOR = '#FFFFFF';

type Rgba = NonNullable<ReturnType<typeof parseCssColor>>;

function toHex(color: Rgba): string {
  const channel = (value: number) =>
    Math.round(Math.max(0, Math.min(255, value)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

function mix(from: Rgba, to: Rgba, amount: number): Rgba {
  return {
    r: from.r + (to.r - from.r) * amount,
    g: from.g + (to.g - from.g) * amount,
    b: from.b + (to.b - from.b) * amount,
    a: 1,
  };
}

/**
 * A note colour is used as a stripe in the sidebar. On a selected row the
 * background changes, so nudge the stripe toward black/white just enough to
 * keep 3:1. Unselected rows keep the exact palette colour.
 */
export function getNoteBorderColor(
  value: string,
  isDark: boolean,
  background?: string,
): string {
  const bg =
    parseCssColor(background ?? (isDark ? '#1f2937' : '#f9fafb')) ??
    parseCssColor('#ffffff')!;
  const preferred = parseCssColor(value) ?? parseCssColor('#ffffff')!;

  if (contrastRatio(preferred, bg) >= MIN_BORDER_CONTRAST) {
    return toHex(preferred);
  }

  const black = parseCssColor('#000000')!;
  const white = parseCssColor('#ffffff')!;
  const target =
    contrastRatio(black, bg) >= contrastRatio(white, bg) ? black : white;

  let candidate = preferred;
  for (let step = 0.05; step <= 1.0001; step += 0.05) {
    candidate = mix(preferred, target, step);
    if (contrastRatio(candidate, bg) >= MIN_BORDER_CONTRAST) {
      return toHex(candidate);
    }
  }
  return toHex(target);
}
