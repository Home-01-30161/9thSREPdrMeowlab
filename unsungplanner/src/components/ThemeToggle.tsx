'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const STORAGE_KEY = 'theme';

/** Applies the theme to <html>. The same logic lives in the inline script in
 * app/layout.tsx, which runs before first paint; this variant is for runtime
 * switches and also persists the user's choice. */
function applyTheme(dark: boolean, persist = true) {
  document.documentElement.classList.toggle('dark', dark);
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
    } catch {
      /* localStorage unavailable — still apply for this session */
    }
  }
}

export default function ThemeToggle({ className = '' }: { className?: string }) {
  // Mirrors what the inline script decided (the `dark` class on <html>).
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.classList.contains('dark'));

    // Follow the OS preference until the user picks a theme explicitly.
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = (e: MediaQueryListEvent) => {
      let overridden = false;
      try {
        overridden = Boolean(localStorage.getItem(STORAGE_KEY));
      } catch {
        /* ignore */
      }
      if (overridden) return;
      applyTheme(e.matches, false);
      setDark(e.matches);
    };
    media.addEventListener('change', onSystemChange);
    return () => media.removeEventListener('change', onSystemChange);
  }, []);

  function toggle() {
    const next = !dark;
    applyTheme(next);
    setDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      // Server and client agree on the initial icon; it swaps after mount if
      // the inline script already applied the dark class.
      className={`retro-btn px-2 py-0.5 flex items-center gap-1 cursor-pointer ${className}`}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle dark mode"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
