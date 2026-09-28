import React, { useEffect, useState } from 'react';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'> & {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
};

/**
 * Whole-number field (e.g. quantity) that can be emptied while typing: "1" → backspace → "2" works.
 * Only when the field is left empty or invalid does it fall back to the minimum.
 */
export const IntegerInput: React.FC<Props> = ({ value, onChange, min = 1, max = 9999, onBlur, onFocus, ...rest }) => {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={text}
      onFocus={(e) => {
        setFocused(true);
        e.target.select();
        onFocus?.(e);
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9]/g, '');
        setText(raw);
        const n = parseInt(raw, 10);
        if (!isNaN(n) && n >= min && n <= max) onChange(n);
      }}
      onBlur={(e) => {
        setFocused(false);
        const n = parseInt(text, 10);
        const committed = isNaN(n) ? min : Math.max(min, Math.min(max, n));
        setText(String(committed));
        onChange(committed);
        onBlur?.(e);
      }}
    />
  );
};
