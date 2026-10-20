import { contrastRatio, parseCssColor } from './contrast';

// WCAG 1.4.11: non-text UI (a border) needs 3:1 against its background
const MIN_BORDER_CONTRAST = 3;

// 9 Post-it note style colours
export const NOTE_COLORS = [
  { name: 'White', value: '#FFFFFF', dark: '#1f2937' },       // Dark Gray
  { name: 'Yellow', value: '#FFF9C4', dark: '#424019' },      // Dark Yellow
  { name: 'Pink', value: '#FFE0E0', dark: '#4a1919' },        // Dark Pink
  { name: 'Blue', value: '#D1E7FF', dark: '#1e3a5f' },       // Dark Blue
  { name: 'Green', value: '#D4EDDA', dark: '#1f4626' },      // Dark Green
  { name: 'Orange', value: '#FFE5CC', dark: '#4d2d15' },     // Dark Orange
  { name: 'Purple', value: '#E8DAEF', dark: '#37263c' },     // Dark Purple
  { name: 'Mint', value: '#D5F5E3', dark: '#264030' },       // Dark Mint
  { name: 'Peach', value: '#FADBD8', dark: '#5c3633' },      // Dark Peach
];

export const DEFAULT_NOTE_COLOR = '#FFFFFF';

export function getNoteColor(value: string, isDark: boolean): string {
  const colorObj = NOTE_COLORS.find(c => c.value.toUpperCase() === value.toUpperCase());
  if (isDark) {
    return colorObj?.dark || '#1f2937';
  }
  return colorObj?.value || '#FFFFFF';
}

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
 * The sidebar/editor stripe has to stay recognisable as the note colour while
 * remaining visible. Pastel notes on a white page (and white notes on white)
 * are nearly invisible, so darken (or lighten on a dark background) just
 * enough to reach 3:1.
 */
export function getNoteBorderColor(
  value: string,
  isDark: boolean,
  background?: string,
): string {
  const bg =
    parseCssColor(background ?? getNoteColor(value, isDark)) ??
    parseCssColor('#ffffff')!;
  const entry = NOTE_COLORS.find(
    (color) => color.value.toUpperCase() === value.toUpperCase(),
  );
  /*
   * Use the opposite end of the palette: on light paper the deep variant is
   * vivid and readable, on dark paper the light one. Falls back to the chosen
   * colour for custom values.
   */
  const preferredValue = entry ? (isDark ? entry.value : entry.dark) : value;
  const preferred =
    parseCssColor(preferredValue) ?? parseCssColor('#ffffff')!;

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
