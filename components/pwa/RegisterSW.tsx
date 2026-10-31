'use client';

import { useEffect } from 'react';

/**
 * RegisterSW — registers the service worker at /sw.js on mount.
 *
 * Mounted once in app/layout.tsx body. Returns null (no UI).
 * Skips registration in dev (next dev) and when SW is unsupported.
 */
export default function RegisterSW(): null {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    // Register after the page is interactive so SW install doesn't contend
    // with the LCP paint.
    const register = () => {
      navigator.serviceWorker
        // updateViaCache 'none' : /sw.js n'est jamais lu depuis le cache HTTP, une
        // nouvelle version (push, notificationclick…) est détectée à chaque navigation.
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch((err) => {
          console.warn('[SW] registration failed:', err);
        });
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
    }
  }, []);

  return null;
}
