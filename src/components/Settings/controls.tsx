import { useEffect, useState, type ReactNode } from 'react';

export function Row({
  label,
  hint,
  children,
  asLabel = true,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  /** False renders a <div> instead of a <label>, so clicking the row text doesn't
   * forward-activate the control inside it (e.g. opening a colour picker). */
  asLabel?: boolean;
}) {
  const Tag = asLabel ? 'label' : 'div';
  return (
    <Tag className="settings__row">
      <span className="settings__label">
        {label}
        {hint && <span className="settings__hint">{hint}</span>}
      </span>
      <span className="settings__control">{children}</span>
    </Tag>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings__section">
      <h3 className="settings__section-title">{title}</h3>
      {children}
    </section>
  );
}

interface NumberProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export function NumberInput({ value, onChange, min, max, step = 1, unit }: NumberProps) {
  return (
    <span className="settings__number">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
      />
      {unit && <span className="settings__unit">{unit}</span>}
    </span>
  );
}

const FONT_SUGGESTIONS = [
  "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif",
  "'Segoe UI', sans-serif",
  "'Inter Variable', sans-serif",
  'Inter, sans-serif',
  "'Open Sans Variable', sans-serif",
  "'Open Sans', sans-serif",
  'Calibri, sans-serif',
  'Arial, sans-serif',
  'Verdana, sans-serif',
  "Georgia, 'Times New Roman', serif",
  'Cambria, serif',
  "'Times New Roman', serif",
  "'Cascadia Code', monospace",
  "'Cascadia Mono', Consolas, monospace",
  'Consolas, monospace',
  "'JetBrains Mono Variable', monospace",
  "'JetBrains Mono', monospace",
  "'Fira Code', monospace",
];

/** Text input with debounced commit so typing a font stack doesn't re-render per keystroke. */
export function FontInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const t = setTimeout(() => onChange(draft), 300);
    return () => clearTimeout(t);
  }, [draft, value, onChange]);
  return (
    <>
      <input
        type="text"
        className="settings__text"
        list="font-suggestions"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
      />
      <datalist id="font-suggestions">
        {FONT_SUGGESTIONS.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
    </>
  );
}

const HEX = /^#[0-9a-f]{6}$/i;

export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = (v: string) => {
    if (HEX.test(v)) onChange(v.toLowerCase());
  };
  return (
    <span className="settings__color">
      <input
        type="color"
        value={HEX.test(value) ? value : '#000000'}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(e.target.value);
        }}
        aria-label="Pick colour"
      />
      <input
        type="text"
        className="settings__text settings__text--hex"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          commit(e.target.value);
        }}
        onBlur={() => setDraft(value)}
        spellCheck={false}
        maxLength={7}
      />
    </span>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select
      className="settings__select"
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <input
      type="checkbox"
      className="settings__toggle"
      checked={value}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}
