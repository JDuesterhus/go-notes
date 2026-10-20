import { useState, useRef, useEffect } from 'react';
import { NOTE_COLORS, DEFAULT_NOTE_COLOR } from '../utils/noteColors';
import { parseCssColor, readableTextColor } from '../utils/contrast';

interface ColorPickerProps {
  currentColor: string;
  onColorChange: (color: string) => void;
}

/*
 * One mid-tone palette for both themes. White is not in the grid: it means
 * "no colour" and has its own action below it.
 */
const PALETTE = NOTE_COLORS.map((color) => color.value);
const COLOR_NAMES: Record<string, string> = Object.fromEntries(
  NOTE_COLORS.map((color) => [color.value, color.name])
);

function ColorPicker({ currentColor, onColorChange }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const selected = (currentColor || DEFAULT_NOTE_COLOR).toUpperCase();
  const isNoColor = selected === DEFAULT_NOTE_COLOR;
  const visualColor = currentColor || DEFAULT_NOTE_COLOR;
  const colorName = isNoColor
    ? 'No color'
    : COLOR_NAMES[selected] || 'Custom';
  // The palette glyph has to stay visible on every swatch
  const iconColor = readableTextColor(
    parseCssColor(visualColor) ?? parseCssColor('#ffffff')!,
  );

  function toggleOpen() {
    if (!isOpen) {
      const rect = pickerRef.current?.getBoundingClientRect();
      if (rect) {
        setPosition({
          top: rect.bottom + 8,
          right: window.innerWidth - rect.right,
        });
      }
    }
    setIsOpen(!isOpen);
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div ref={pickerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={toggleOpen}
        style={{
          width: '36px',
          height: '36px',
          border: '2px solid var(--border-main)',
          borderRadius: '8px',
          backgroundColor: visualColor,
          cursor: 'pointer',
          position: 'relative',
          transition: 'all 0.15s',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-hover)';
          e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-main)';
          e.currentTarget.style.transform = 'scale(1)';
        }}
        title={`Note color: ${colorName}`}
      >
        <span
          className="material-symbols-outlined"
          aria-hidden="true"
          style={{
            position: 'absolute',
            bottom: '1px',
            right: '1px',
            fontSize: '16px',
            lineHeight: 1,
            color: iconColor,
            pointerEvents: 'none'
          }}
        >
          palette
        </span>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: position?.top ?? 0,
            right: position?.right ?? 0,
            backgroundColor: 'var(--bg-panel)',
            border: '1px solid var(--border-main)',
            borderRadius: '12px',
            padding: '12px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            zIndex: 1001,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
            width: '144px'
          }}
        >
          {PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => {
                onColorChange(color);
                setIsOpen(false);
              }}
              style={{
                width: '36px',
                height: '36px',
                border: selected === color ? '3px solid var(--primary)' : '2px solid var(--border-main)',
                borderRadius: '8px',
                backgroundColor: color,
                cursor: 'pointer',
                transition: 'all 0.15s',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
              }}
              title={COLOR_NAMES[color]}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.1)';
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
              }}
            />
          ))}

          <button
            type="button"
            onClick={() => {
              onColorChange(DEFAULT_NOTE_COLOR);
              setIsOpen(false);
            }}
            style={{
              gridColumn: '1 / -1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '7px 8px',
              border: 'none',
              borderRadius: '8px',
              backgroundColor: 'var(--bg-hover)',
              color: 'var(--text-main)',
              cursor: 'pointer',
              font: 'inherit',
              fontSize: '13px'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
              block
            </span>
            No color
          </button>
        </div>
      )}
    </div>
  );
}

export default ColorPicker;
