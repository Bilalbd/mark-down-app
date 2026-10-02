import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react';
import { ICON } from '@/components/Toolbar/Toolbar';
import {
  BUILTIN_FONTS,
  SOURCE_LABELS,
  buildPickerRows,
  catalogToFamilies,
  downloadedToFamilies,
  excludeBuiltin,
  filterFonts,
  fontKey,
  fontStack,
  googleFamilies,
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
import { useFontsStore } from '@/store/fonts';
import { FontInput } from './controls';
import { removeDownloadedFontConfirmed } from './removeFont';
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

const LOADING_NOTE = 'Loading Google Fonts…';
const OFFLINE_NOTE = 'Needs an internet connection to add Google fonts';

interface DownloadState {
  id: string;
  family: string;
  done: number;
  total: number;
}

/** `Downloading… 3/12`, or just `Downloading…` until the first file count arrives. */
function progressLabel(p: DownloadState): string {
  return p.total > 0 ? `Downloading… ${p.done}/${p.total}` : 'Downloading…';
}

/** A Google font that has to be downloaded before it can be used or previewed. */
function needsDownload(font: FontFamily): boolean {
  return font.source === 'google' && !font.downloaded && !!font.googleId;
}

/** A downloaded Google font, which can be removed from this PC. */
function isRemovable(font: FontFamily): boolean {
  return font.source === 'google' && !!font.downloaded && !!font.googleId;
}

/** A small tag for a row. Installed fonts only know mono or not, so they never claim a category. */
function categoryTag(font: FontFamily): string {
  if (font.source === 'system') return font.monospace ? 'Mono' : '';
  const label = CATEGORY_LABELS[font.category];
  return font.downloaded ? `${label} · Downloaded` : label;
}

function errorMessage(e: unknown): string {
  if (typeof e === 'string') return e;
  return e instanceof Error ? e.message : String(e);
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
  const [progress, setProgress] = useState<DownloadState | null>(null);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const catalog = useFontsStore((s) => s.catalog);
  const catalogStatus = useFontsStore((s) => s.catalogStatus);
  const downloaded = useFontsStore((s) => s.downloaded);
  const downloadedLoaded = useFontsStore((s) => s.downloadedLoaded);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingFocus = useRef<'input' | 'button' | null>(null);
  const mounted = useRef(true);
  /** The Google font id whose download should be applied when it finishes; null if superseded. */
  const wanted = useRef<string | null>(null);
  /** The Google font id being removed (possibly waiting on the confirmation); one at a time. */
  const removingId = useRef<string | null>(null);
  /** Where the highlight goes if the removed font's row disappears from the list. */
  const afterRemoval = useRef<{ id: string; key: string; nearest: string | null } | null>(null);
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

  useEffect(() => {
    mounted.current = true;
    void useFontsStore.getState().loadDownloaded();
    return () => {
      mounted.current = false;
    };
  }, []);

  const downloadedFamilies = useMemo(() => downloadedToFamilies(downloaded), [downloaded]);
  const catalogFamilies = useMemo(() => (catalog ? catalogToFamilies(catalog) : []), [catalog]);
  const googleList = useMemo(
    () =>
      googleFamilies({
        catalog: catalogFamilies,
        downloaded: downloadedFamilies,
        builtin: BUILTIN_FONTS,
        system: system ?? [],
      }),
    [catalogFamilies, downloadedFamilies, system],
  );

  const resolved = useMemo(
    () =>
      resolveFamily(value, {
        builtin: BUILTIN_FONTS,
        downloaded: downloadedFamilies,
        system: system ?? [],
        google: catalogFamilies,
      }),
    [value, downloadedFamilies, system, catalogFamilies],
  );
  const name = primaryFamily(value);

  // The catalogue is only fetched when a picker opens, so until then a family nothing local
  // provides shows just its name (no note); it may or may not be a Google font.
  const selectedKey = resolved ? fontKey(resolved) : allowSame && !value.trim() ? 'same' : null;

  const searching = query.trim() !== '';
  const rows = useMemo(() => {
    const filtered = filterFonts([...BUILTIN_FONTS, ...(system ?? []), ...googleList], {
      query,
      monospaceOnly,
      arabicOnly,
    });
    const googleNote =
      catalogStatus === 'loading'
        ? LOADING_NOTE
        : catalogStatus === 'offline'
          ? OFFLINE_NOTE
          : null;
    return buildPickerRows({
      groups: groupFonts(filtered),
      searching,
      allowSame,
      expanded,
      googleNote,
    });
  }, [
    system,
    googleList,
    catalogStatus,
    query,
    monospaceOnly,
    arabicOnly,
    searching,
    allowSame,
    expanded,
  ]);
  const options = useMemo(
    () => rows.flatMap((r) => (r.type === 'option' ? [r.option] : [])),
    [rows],
  );
  const hasFonts = options.some((o) => o.kind === 'font');
  const hasNote = rows.some((r) => r.type === 'note');

  // Row ids come from this map so each row's id is O(1), not a scan of every option.
  const indexByKey = useMemo(() => new Map(options.map((o, i) => [o.key, i])), [options]);
  let activeIndex = activeKey === null ? -1 : (indexByKey.get(activeKey) ?? -1);
  if (activeIndex < 0)
    activeIndex = Math.max(
      0,
      options.findIndex((o) => o.kind === 'font'),
    );
  const optionId = (key: string) => `${uid}-${indexByKey.get(key)}`;
  const activeId = options[activeIndex] ? optionId(options[activeIndex].key) : undefined;

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const p = afterRemoval.current;
    if (!p || downloaded.some((f) => f.id === p.id)) return;
    afterRemoval.current = null;
    // The row stays (as a not-downloaded font) unless a filter hides it; then the nearest row.
    if (!indexByKey.has(p.key)) setActiveKey(p.nearest);
  }, [downloaded, indexByKey]);

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
    setFailure(null);
    setOpen(true);
    // Both are session caches, so reopening costs nothing once they are loaded.
    void useFontsStore.getState().loadCatalog();
    void useFontsStore.getState().registerAll();
  };
  const closePopover = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  /** Downloads a Google font, then applies it, unless another choice was made meanwhile. */
  const downloadAndApply = async (font: FontFamily) => {
    const id = font.googleId;
    if (!id || wanted.current === id) return;
    wanted.current = id;
    setFailure(null);
    const start: DownloadState = { id, family: font.family, done: 0, total: 0 };
    setProgress(start);
    try {
      await useFontsStore.getState().download(id, (p) => {
        if (mounted.current && wanted.current === id) setProgress({ ...start, ...p });
      });
    } catch (e) {
      if (mounted.current && wanted.current === id) {
        wanted.current = null;
        setProgress(null);
        setFailure({ id, message: errorMessage(e) });
      }
      return;
    }
    if (!mounted.current || wanted.current !== id) return;
    wanted.current = null;
    setProgress(null);
    onChange(fontStack(font));
    const hadFocus = wrapRef.current?.contains(document.activeElement);
    setOpen(false);
    if (hadFocus) buttonRef.current?.focus();
  };

  /** Removes a downloaded Google font from this PC; the row stays as a not-downloaded font. */
  const removeFont = async (font: FontFamily) => {
    const id = font.googleId;
    if (!id || removingId.current || wanted.current === id) return;
    removingId.current = id;
    setRemoving(id);
    setFailure(null);
    const key = fontKey(font);
    const at = indexByKey.get(key) ?? -1;
    const isFont = (o: PickerOption) => o.kind === 'font';
    const nearest =
      options.slice(at + 1).find(isFont) ?? options.slice(0, at).reverse().find(isFont);
    afterRemoval.current = { id, key, nearest: nearest?.key ?? null };
    try {
      const removed = await removeDownloadedFontConfirmed({ id, family: font.family });
      if (!removed) afterRemoval.current = null;
    } catch (e) {
      afterRemoval.current = null;
      if (mounted.current) {
        setFailure({ id, message: `Could not remove: ${errorMessage(e)}` });
      }
    } finally {
      removingId.current = null;
      if (mounted.current) setRemoving(null);
    }
  };

  const choose = (option: PickerOption) => {
    switch (option.kind) {
      case 'same':
        wanted.current = null;
        onChange('');
        closePopover();
        break;
      case 'font':
        if (needsDownload(option.font)) {
          void downloadAndApply(option.font);
          break;
        }
        wanted.current = null;
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
    } else if (e.key === 'Delete') {
      // Only at the end of the text (or in an empty box); elsewhere Delete edits the text.
      const input = e.currentTarget;
      const atEnd =
        input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
      const active = options[activeIndex];
      if (atEnd && active?.kind === 'font' && isRemovable(active.font)) {
        e.preventDefault();
        void removeFont(active.font);
      }
      return;
    }
    if (next === null) return;
    e.preventDefault();
    setActiveKey(options[next].key);
  };

  if (custom) {
    return (
      <div className="font-picker font-picker--custom" ref={wrapRef}>
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

  let shownName: string;
  let shownNote = '';
  let shownStyle: { fontFamily: string } | undefined;
  if (progress) {
    shownName = progress.family;
    shownNote = progressLabel(progress);
  } else if (resolved) {
    shownName = resolved.family;
    shownNote = needsDownload(resolved)
      ? `${SOURCE_LABELS.google} · not downloaded`
      : SOURCE_LABELS[resolved.source];
    if (!needsDownload(resolved)) shownStyle = { fontFamily: fontStack(resolved) };
  } else if (name) {
    shownName = name;
    if (isGenericFamily(name)) shownNote = 'Custom';
    else if (
      system &&
      downloadedLoaded &&
      (catalogStatus === 'ready' || catalogStatus === 'offline')
    )
      shownNote = 'Not installed';
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
        title={shownNote ? `${shownName} (${shownNote})` : shownName}
        onClick={() => (open ? closePopover() : openPopover())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            openPopover();
          }
        }}
      >
        <span
          className={`font-picker__name ${resolved || !name || progress ? '' : 'is-missing'}`}
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
                    {row.text === LOADING_NOTE && (
                      <Loader2
                        {...ICON_SMALL}
                        aria-hidden="true"
                        className="font-picker__spinner"
                      />
                    )}
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
                        style={
                          needsDownload(o.font) ? undefined : { fontFamily: fontStack(o.font) }
                        }
                      >
                        {o.font.family}
                      </span>
                      <span className="font-picker__row-tag">
                        {progress && progress.id === o.font.googleId
                          ? progressLabel(progress)
                          : categoryTag(o.font)}
                      </span>
                    </>
                  ) : (
                    <span>
                      {o.kind === 'same' && 'Same as body'}
                      {o.kind === 'more' && `Show all (${o.total})`}
                      {o.kind === 'custom' && 'Custom CSS font list…'}
                    </span>
                  )}
                  {o.kind === 'font' && isRemovable(o.font) && (
                    <button
                      type="button"
                      className={`font-picker__remove ${removing === o.font.googleId ? 'is-busy' : ''}`}
                      aria-label={`Remove ${o.font.family}`}
                      title="Remove from this PC (Delete)"
                      tabIndex={-1}
                      // Keep focus in the search box.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.stopPropagation();
                        void removeFont(o.font);
                      }}
                    >
                      <X {...ICON_SMALL} aria-hidden="true" />
                    </button>
                  )}
                  {isSelected && (
                    <Check {...ICON_SMALL} aria-hidden="true" className="font-picker__check" />
                  )}
                  {o.kind === 'font' && failure && failure.id === o.font.googleId && (
                    <span role="alert" className="font-picker__row-error">
                      {failure.message}
                    </span>
                  )}
                </li>
              );
            })}
            {!hasFonts && !hasNote && (
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
