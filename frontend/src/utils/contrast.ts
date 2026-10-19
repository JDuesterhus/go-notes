import type Quill from 'quill';

/**
 * WCAG 2.2 AA minimum for normal body text. Large text (>= 18.66px bold or
 * >= 24px) may use 3:1, but Quill selections can be any size, so enforcing
 * 4.5:1 everywhere is the safe, predictable rule.
 */
export const MIN_TEXT_CONTRAST = 4.5;

type Rgba = { r: number; g: number; b: number; a: number };

let canvas: HTMLCanvasElement | null = null;
let isNormalizing = false;

function getCanvasContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!canvas) canvas = document.createElement('canvas');
  return canvas.getContext('2d');
}

/**
 * Let the browser normalize any CSS colour Quill/HTML may contain
 * (hex, rgb(), rgba(), named colours, etc.). Returns null for values the
 * canvas cannot parse.
 */
export function parseCssColor(value: string | null | undefined): Rgba | null {
  if (!value) return null;
  const ctx = getCanvasContext();
  if (!ctx) return null;

  const sentinel = '#010203';
  ctx.fillStyle = sentinel;
  ctx.fillStyle = value;
  const normalized = ctx.fillStyle;

  // An invalid value leaves the previous fillStyle in place.
  if (normalized === sentinel && value.trim().toLowerCase() !== sentinel) {
    return null;
  }

  if (normalized.startsWith('#')) {
    const hex = normalized.slice(1);
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    }
    return null;
  }

  const match = normalized.match(/^rgba?\(([^)]+)\)$/i);
  if (!match) return null;

  const parts = match[1].split(',').map((part) => part.trim());
  if (parts.length < 3) return null;

  const r = Number(parts[0]);
  const g = Number(parts[1]);
  const b = Number(parts[2]);
  const a = parts.length >= 4 ? Number(parts[3]) : 1;
  if ([r, g, b, a].some((part) => !Number.isFinite(part))) return null;

  return { r, g, b, a };
}

function composite(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a + bg.a * (1 - fg.a);
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
    g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
    b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
    a,
  };
}

function channelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance({ r, g, b }: Rgba): number {
  return (
    0.2126 * channelToLinear(r) +
    0.7152 * channelToLinear(g) +
    0.0722 * channelToLinear(b)
  );
}

export function contrastRatio(foreground: Rgba, background: Rgba): number {
  const fg = relativeLuminance(foreground);
  const bg = relativeLuminance(background);
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

function toHex({ r, g, b }: Rgba): string {
  const channel = (value: number) =>
    Math.round(Math.max(0, Math.min(255, value)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/**
 * Pick a foreground for a (possibly translucent) background. The app's own
 * dark/light text colours are preferred so the result stays on-theme; pure
 * black/white are the fallback if a mid-tone background makes both theme
 * colours miss the 4.5:1 target.
 */
export function readableTextColor(background: Rgba, preferred?: Rgba | null): string {
  const themeDark = parseCssColor('#111827')!;
  const themeLight = parseCssColor('#f9fafb')!;
  const candidates: Array<{ color: Rgba; value: string }> = [];

  if (preferred && contrastRatio(preferred, background) >= MIN_TEXT_CONTRAST) {
    return toHex(preferred);
  }

  candidates.push({ color: themeDark, value: '#111827' });
  candidates.push({ color: themeLight, value: '#f9fafb' });
  candidates.push({ color: parseCssColor('#000000')!, value: '#000000' });
  candidates.push({ color: parseCssColor('#ffffff')!, value: '#ffffff' });

  let best = candidates[0];
  let bestRatio = contrastRatio(best.color, background);

  for (const candidate of candidates.slice(1)) {
    const ratio = contrastRatio(candidate.color, background);
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
  }

  return best.value;
}

function normalizeCssColor(value: string): string {
  const parsed = parseCssColor(value);
  return parsed ? toHex(parsed) : value;
}

/**
 * Quill only stores an inline background colour, so a user can pick a dark
 * chip in dark mode or a bright chip in light mode and leave the text
 * unreadable. Walk the document model and give every background a foreground
 * that reaches WCAG AA. Runs through Quill's own API so the correction is
 * persisted in the collaborative document, not just painted on the DOM.
 */
export function normalizeBackgroundContrast(
  quill: Quill,
  editorBackground?: string,
): void {
  if (isNormalizing) return;

  const fallbackBackground =
    parseCssColor(editorBackground) ||
    parseCssColor(
      getComputedStyle(document.documentElement).getPropertyValue('--bg-main').trim(),
    ) ||
    parseCssColor('#ffffff')!;

  const defaultText =
    parseCssColor(
      getComputedStyle(document.documentElement).getPropertyValue('--text-main').trim(),
    ) || parseCssColor('#111827')!;

  const fixes: Array<{ index: number; length: number; color: string }> = [];
  let index = 0;

  for (const op of quill.getContents().ops) {
    const insert = op.insert;
    const length = typeof insert === 'string' ? insert.length : 1;

    if (typeof insert === 'string') {
      const backgroundValue = op.attributes?.background;
      if (typeof backgroundValue === 'string') {
        const background = parseCssColor(backgroundValue);
        if (background && background.a > 0) {
          const effectiveBackground = composite(background, fallbackBackground);
          const currentValue =
            typeof op.attributes?.color === 'string'
              ? op.attributes.color
              : getComputedStyle(document.documentElement)
                  .getPropertyValue('--text-main')
                  .trim();
          const current = parseCssColor(currentValue) || defaultText;

          if (contrastRatio(current, effectiveBackground) < MIN_TEXT_CONTRAST) {
            const readable = readableTextColor(effectiveBackground, current);
            if (normalizeCssColor(currentValue || '') !== readable) {
              fixes.push({ index, length, color: readable });
            }
          }
        }
      }
    }

    index += length;
  }

  if (fixes.length === 0) return;

  isNormalizing = true;
  try {
    for (const fix of fixes) {
      quill.formatText(fix.index, fix.length, 'color', fix.color, 'api');
    }
  } finally {
    isNormalizing = false;
  }
}
