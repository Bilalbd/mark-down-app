import { useEffect } from 'react';
import { useSettingsStore } from '@/store/settings';

export type ResolvedTheme = 'light' | 'dark';

/** Resolves the user's theme preference against the OS and applies it to <html data-theme>. */
export function useAppTheme() {
  const appTheme = useSettingsStore((s) => s.appTheme);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved: ResolvedTheme =
        appTheme === 'system' ? (mq.matches ? 'dark' : 'light') : appTheme;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [appTheme]);
}

export function useResolvedTheme(): ResolvedTheme {
  const appTheme = useSettingsStore((s) => s.appTheme);
  if (appTheme !== 'system') return appTheme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
