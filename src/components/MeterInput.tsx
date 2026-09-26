import React, { useEffect, useState } from 'react';
import { formatMeters, parseMeters } from '../utils/measure';

interface MeterInputProps {
  value: number;
  onChange: (meters: number) => void;
  min?: number;
  max?: number;
  className?: string;
  placeholder?: string;
  id?: string;
  'aria-label'?: string;
}

/**
 * Text field for a length in meters with cm precision. Keeps what the user types locally
 * (so clearing the field to retype doesn't snap to a default), accepts "3.47", "3,47" and
 * "347cm", and commits a clamped value while typing and on blur.
 */
export const MeterInput: React.FC<MeterInputProps> = ({
  value,
  onChange,
  min = 0,
  max = 200,
  className = '',
  placeholder = '',
  id,
  'aria-label': ariaLabel,
}) => {
  const [text, setText] = useState(formatMeters(value ?? 0, false));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(formatMeters(value ?? 0, false));
  }, [value, focused]);

  const clamp = (n: number) => Math.max(min, Math.min(max, n));

  return (
    <input
      id={id}
      aria-label={ariaLabel}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      placeholder={placeholder}
      className={className}
      onFocus={(e) => {
        setFocused(true);
        e.target.select();
      }}
      onChange={(e) => {
        const raw = e.target.value;
        if (!/^[\d.,\s]*(c|cm|m)?$/i.test(raw)) return;
        setText(raw);
        const n = parseMeters(raw);
        if (!isNaN(n) && n >= min && n <= max) onChange(n);
      }}
      onBlur={() => {
        setFocused(false);
        const n = parseMeters(text);
        const committed = isNaN(n) ? clamp(value ?? min) : clamp(n);
        setText(formatMeters(committed, false));
        onChange(committed);
      }}
    />
  );
};
