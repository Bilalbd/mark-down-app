import { useEffect } from 'react';
import { useResolvedTheme } from '@/lib/useAppTheme';
import { useStyleStore } from '@/store/style';
import { presetToCssVars } from '@/styles/presetCss';
import { presetToChromeCss } from '@/styles/chromeCss';

/**
 * Keeps three <style> elements in <head> in sync with the active preset: the app
 * chrome palette derived from it, the preview CSS variables, and the user's custom
 * CSS (placed last so it can override anything).
 */
export function StyleInjector() {
  const theme = useResolvedTheme();
  const presets = useStyleStore((s) => s.presets);
  const activeId = useStyleStore((s) => s.activePresetId);
  const preset = presets.find((p) => p.id === activeId) ?? presets[0];

  useEffect(() => {
    const chrome = ensureStyle('preset-chrome');
    const vars = ensureStyle('preset-vars');
    const custom = ensureStyle('preset-custom');
    chrome.textContent = presetToChromeCss(preset, theme);
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
