import { useEffect, useSyncExternalStore } from 'react';
import { useSettingsStore } from '@/store/settings';

export type ResolvedTheme = 'light' | 'dark';

const mq = window.matchMedia('(prefers-color-scheme: dark)');
const subscribe = (cb: () => void) => {
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const getSystemDark = () => mq.matches;

/** The theme actually in effect, following the OS when the preference is 'system'. */
export function useResolvedTheme(): ResolvedTheme {
  const appTheme = useSettingsStore((s) => s.appTheme);
  const systemDark = useSyncExternalStore(subscribe, getSystemDark);
  if (appTheme !== 'system') return appTheme;
  return systemDark ? 'dark' : 'light';
}

/** Applies the resolved theme to <html data-theme> so all chrome CSS follows it. */
export function useAppTheme(): ResolvedTheme {
  const resolved = useResolvedTheme();
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);
  return resolved;
}
