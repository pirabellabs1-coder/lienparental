'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * InstallPrompt — floating "Installer l'app" button (bottom-right).
 *
 * - Listens to the standard `beforeinstallprompt` event (Chrome/Edge/Android).
 * - Shows the button only AFTER:
 *     • the event has fired (i.e. install is actually available), AND
 *     • 5 seconds of use (so we don't nag first-paint users), AND
 *     • the user has not dismissed it this session.
 * - Dismiss state is kept in sessionStorage (no cookie, no persistence beyond
 *   the current tab/session).
 */
export default function InstallPrompt() {
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [delayElapsed, setDelayElapsed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem('lp:install-dismissed') === '1') return;

    const onBIP = (e: Event) => {
      e.preventDefault();
      deferredRef.current = e as BeforeInstallPromptEvent;
      if (delayElapsed) setVisible(true);
    };

    const onInstalled = () => {
      setVisible(false);
      deferredRef.current = null;
    };

    window.addEventListener('beforeinstallprompt', onBIP);
    window.addEventListener('appinstalled', onInstalled);

    const t = window.setTimeout(() => {
      setDelayElapsed(true);
      if (deferredRef.current) setVisible(true);
    }, 5000);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('appinstalled', onInstalled);
      window.clearTimeout(t);
    };
  }, [delayElapsed]);

  if (!visible) return null;

  const handleInstall = async () => {
    const evt = deferredRef.current;
    if (!evt) return;
    try {
      await evt.prompt();
      await evt.userChoice;
    } finally {
      deferredRef.current = null;
      setVisible(false);
    }
  };

  const handleDismiss = () => {
    try {
      sessionStorage.setItem('lp:install-dismissed', '1');
    } catch {
      /* storage disabled — fine, we just close */
    }
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-labelledby="lp-install-title"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-night-900/95 backdrop-blur border border-white/10 shadow-lg px-3 py-2 text-sm text-white"
    >
      <span id="lp-install-title" className="pl-2 pr-1 font-medium">
        Installer l&apos;app
      </span>
      <button
        type="button"
        onClick={handleInstall}
        className="rounded-full bg-leaf-500 hover:bg-leaf-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf-500 px-4 py-1.5 font-semibold transition-colors"
      >
        Installer
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Fermer la proposition d'installation"
        className="rounded-full p-1.5 text-white/70 hover:text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf-500 transition-colors"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M5 5l10 10M15 5L5 15" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Minimal structural type for the non-standard `beforeinstallprompt` event
 * (Chromium). Kept local so we don't need a dependency on lib.dom extras.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}
