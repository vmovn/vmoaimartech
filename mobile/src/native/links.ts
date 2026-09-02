import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';

/**
 * Deep link handler. Custom scheme (`pmai://`) and universal links
 * (`https://pm.ai.vn/*`, `https://app.pm.ai.vn/*`) are both routed
 * through the same handler and mapped onto expo-router paths.
 */
export function parseDeepLink(url: string): string | null {
  try {
    const parsed = Linking.parse(url);
    const path = parsed.path ? `/${parsed.path}` : '/';
    const qs = parsed.queryParams
      ? '?' +
        Object.entries(parsed.queryParams)
          .filter(([, v]) => v != null)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join('&')
      : '';
    return path + (qs === '?' ? '' : qs);
  } catch {
    return null;
  }
}

export function useDeepLinks() {
  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url) return;
      const path = parseDeepLink(url);
      if (path) router.push(path as any);
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);
}

export function createShareableLink(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `https://pm.ai.vn${clean}`;
}
