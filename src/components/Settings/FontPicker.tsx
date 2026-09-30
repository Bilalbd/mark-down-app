import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { ICON } from '@/components/Toolbar/Toolbar';
import {
  BUILTIN_FONTS,
  SOURCE_LABELS,
  buildPickerRows,
  excludeBuiltin,
  filterFonts,
  fontKey,
  fontStack,
  groupFonts,
  isCustomStack,
  isGenericFamily,
  primaryFamily,
  resolveFamily,
  systemFontsToFamilies,
  type FontCategory,
  type FontFamily,
  type FontSource,
  type PickerOption,
} from '@/lib/fonts';
import { listSystemFonts } from '@/lib/tauri';
import { FontInput } from './controls';
import './FontPicker.css';

interface Props {
  /** The CSS `font-family` stack. */
  value: string;
  onChange: (stack: string) => void;
  /** Names the control, e.g. "Body font". */
  label: string;
  /** Heading font: a blank stack means "same as body", offered as the first row. */
  allowSame?: boolean;
  /** Code font: list monospace fonts only. */
  monospaceOnly?: boolean;
}

const CATEGORY_LABELS: Record<FontCategory, string> = {
  'sans-serif': 'Sans',
  serif: 'Serif',
  monospace: 'Mono',
  display: 'Display',
  handwriting: 'Handwriting',
};

/** A small tag for a row. Installed fonts only know mono or not, so they never claim a category. */
function categoryTag(font: FontFamily): string {
  if (font.source === 'system') return font.monospace ? 'Mono' : '';
  return CATEGORY_LABELS[font.category];
}

const ICON_SMALL = { ...ICON, size: 14 };

/**
 * Picks a font for one typography slot from a searchable, grouped list, and writes the choice as a
 * CSS stack. A stack the list can't express opens in free-text mode instead (see `isCustomStack`).
 */
export function FontPicker({
  value,
  onChange,
  label,
  allowSame = false,
  monospaceOnly = false,
}: Props) {
  const [custom, setCustom] = useState(() => isCustomStack(value));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [arabicOnly, setArabicOnly] = useState(false);
  const [expanded, setExpanded] = useState<FontSource[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [system, setSystem] = useState<FontFamily[] | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingFocus = useRef<'input' | 'button' | null>(null);
  const uid = useId();
  const listId = `${uid}-list`;

  useEffect(() => {
    let alive = true;
    // listSystemFonts resolves to [] on failure, so the picker still works with its other groups.
    void listSystemFonts().then((list) => {
      if (alive) setSystem(excludeBuiltin(systemFontsToFamilies(list)));
    });
    return () => {
      alive = false;
    };
  }, []);

  const resolved = useMemo(
    () => resolveFamily(value, { builtin: BUILTIN_FONTS, system: system ?? [] }),
    [value, system],
  );
  const selectedKey = resolved ? fontKey(resolved) : allowSame && !value.trim() ? 'same' : null;

  const searching = query.trim() !== '';
  const rows = useMemo(() => {
    const filtered = filterFonts([...BUILTIN_FONTS, ...(system ?? [])], {
      query,
      monospaceOnly,
      arabicOnly,
    });
    return buildPickerRows({ groups: groupFonts(filtered), searching, allowSame, expanded });
  }, [system, query, monospaceOnly, arabicOnly, searching, allowSame, expanded]);
  const options = useMemo(
    () => rows.flatMap((r) => (r.type === 'option' ? [r.option] : [])),
    [rows],
  );
  const hasFonts = options.some((o) => o.kind === 'font');

  let activeIndex = options.findIndex((o) => o.key === activeKey);
  if (activeIndex < 0)
    activeIndex = Math.max(
      0,
      options.findIndex((o) => o.kind === 'font'),
    );
  const optionId = (key: string) => `${uid}-${options.findIndex((o) => o.key === key)}`;
  const activeId = options[activeIndex] ? optionId(options[activeIndex].key) : undefined;

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || !activeId) return;
    // jsdom has no scrollIntoView.
    document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, activeId]);

  useEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (target === 'input') wrapRef.current?.querySelector('input')?.focus();
    else if (target === 'button') buttonRef.current?.focus();
  }, [custom]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const openPopover = () => {
    setQuery('');
    setExpanded([]);
    setActiveKey(selectedKey);
    setOpen(true);
  };
  const closePopover = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const choose = (option: PickerOption) => {
    switch (option.kind) {
      case 'same':
        onChange('');
        closePopover();
        break;
      case 'font':
        onChange(fontStack(option.font));
        closePopover();
        break;
      case 'more':
        setExpanded((prev) => [...prev, option.source]);
        setActiveKey(option.next);
        inputRef.current?.focus();
        break;
      case 'custom':
        pendingFocus.current = 'input';
        setOpen(false);
        setCustom(true);
        break;
    }
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const last = options.length - 1;
    let next: number | null = null;
    if (e.key === 'ArrowDown') next = activeIndex >= last ? 0 : activeIndex + 1;
    else if (e.key === 'ArrowUp') next = activeIndex <= 0 ? last : activeIndex - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (options[activeIndex]) choose(options[activeIndex]);
      return;
    }
    if (next === null) return;
    e.preventDefault();
    setActiveKey(options[next].key);
  };

  if (custom) {
    return (
      <div className="font-picker" ref={wrapRef}>
        <FontInput
          value={value}
          onChange={onChange}
          placeholder={allowSame ? 'Same as body' : undefined}
        />
        <button
          type="button"
          className="font-picker__link"
          onClick={() => {
            pendingFocus.current = 'button';
            setCustom(false);
          }}
        >
          Choose from list
        </button>
      </div>
    );
  }

  const name = primaryFamily(value);
  let shownName: string;
  let shownNote = '';
  let shownStyle: { fontFamily: string } | undefined;
  if (resolved) {
    shownName = resolved.family;
    shownNote = SOURCE_LABELS[resolved.source];
    shownStyle = { fontFamily: fontStack(resolved) };
  } else if (name) {
    shownName = name;
    if (isGenericFamily(name)) shownNote = 'Custom';
    else if (system) shownNote = 'Not installed';
  } else {
    shownName = allowSame ? 'Same as body' : 'Choose a font';
  }

  return (
    <div className="font-picker" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="font-picker__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${shownName}${shownNote ? `, ${shownNote}` : ''}`}
        onClick={() => (open ? closePopover() : openPopover())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            openPopover();
          }
        }}
      >
        <span
          className={`font-picker__name ${resolved || !name ? '' : 'is-missing'}`}
          style={shownStyle}
        >
          {shownName}
        </span>
        {shownNote && <span className="font-picker__note">{shownNote}</span>}
        <ChevronDown {...ICON_SMALL} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="font-picker__popover"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              closePopover();
            }
          }}
        >
          <div className="font-picker__search">
            <Search {...ICON_SMALL} aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-label={`Search ${label.toLowerCase()}`}
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={activeId}
              placeholder="Search fonts"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveKey(null);
              }}
              onKeyDown={onSearchKey}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <label className="font-picker__filter">
            <input
              type="checkbox"
              className="settings__toggle"
              checked={arabicOnly}
              onChange={(e) => {
                setArabicOnly(e.target.checked);
                setActiveKey(null);
              }}
            />
            Supports Arabic
          </label>
          <ul id={listId} className="font-picker__list" role="listbox" aria-label={label}>
            {rows.map((row) => {
              if (row.type === 'header') {
                return (
                  <li key={row.key} role="presentation" className="font-picker__group">
                    {SOURCE_LABELS[row.source]}
                  </li>
                );
              }
              if (row.type === 'note') {
                return (
                  <li key={row.key} role="presentation" className="font-picker__empty">
                    {row.text}
                  </li>
                );
              }
              const o = row.option;
              const isActive = o === options[activeIndex];
              const isSelected = o.key === selectedKey;
              return (
                <li
                  key={o.key}
                  id={optionId(o.key)}
                  role="option"
                  aria-selected={isSelected}
                  className={`font-picker__option ${isActive ? 'is-active' : ''} ${
                    o.kind === 'font' ? '' : 'is-action'
                  }`}
                  // Keep focus in the search box so typing and arrow keys keep working.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => setActiveKey(o.key)}
                  onClick={() => choose(o)}
                >
                  {o.kind === 'font' ? (
                    <>
                      <span
                        className="font-picker__row-name"
                        style={{ fontFamily: fontStack(o.font) }}
                      >
                        {o.font.family}
                      </span>
                      <span className="font-picker__row-tag">{categoryTag(o.font)}</span>
                    </>
                  ) : (
                    <span>
                      {o.kind === 'same' && 'Same as body'}
                      {o.kind === 'more' && `Show all (${o.total})`}
                      {o.kind === 'custom' && 'Custom CSS font list…'}
                    </span>
                  )}
                  {isSelected && (
                    <Check {...ICON_SMALL} aria-hidden="true" className="font-picker__check" />
                  )}
                </li>
              );
            })}
            {!hasFonts && (
              <li role="presentation" className="font-picker__empty">
                No fonts match.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
