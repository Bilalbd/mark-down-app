import { useEffect } from 'react';
import { useResolvedTheme } from '@/lib/useAppTheme';
import { useStyleStore } from '@/store/style';
import { presetToCssVars } from '@/styles/presetCss';

/**
 * Keeps two <style> elements in <head> in sync with the active preset:
 * one for the generated CSS variables, one for the user's custom CSS
 * (placed after so it can override anything).
 */
export function StyleInjector() {
  const theme = useResolvedTheme();
  const presets = useStyleStore((s) => s.presets);
  const activeId = useStyleStore((s) => s.activePresetId);
  const preset = presets.find((p) => p.id === activeId) ?? presets[0];

  useEffect(() => {
    const vars = ensureStyle('preset-vars');
    const custom = ensureStyle('preset-custom');
    vars.textContent = presetToCssVars(preset, theme);
    custom.textContent = preset.customCss;
  }, [preset, theme]);

  return null;
}

function ensureStyle(id: string): HTMLStyleElement {
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    document.head.appendChild(el);
  }
  return el;
}
