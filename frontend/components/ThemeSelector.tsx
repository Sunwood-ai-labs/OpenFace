'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'openface-theme-v2';
const LEGACY_STORAGE_KEY = 'openface-theme';

const themes = [
  { value: 'standard', label: 'Standard', mark: 'OF' },
  { value: 'solarpunk', label: 'Solarpunk', mark: '☀' },
  { value: 'cyberpunk', label: 'Cyberpunk', mark: '◈' },
] as const;

type ThemeName = (typeof themes)[number]['value'];

function applyTheme(theme: ThemeName) {
  const root = document.documentElement;
  if (theme === 'standard') {
    delete root.dataset.openfaceTheme;
  } else {
    root.dataset.openfaceTheme = theme;
  }
  localStorage.setItem(STORAGE_KEY, theme);
  document.cookie = `openface-theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export default function ThemeSelector() {
  const [theme, setTheme] = useState<ThemeName>('standard');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeName | null;
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY) as ThemeName | null;
    const initial = themes.some(({ value }) => value === saved)
      ? saved!
      : legacy && legacy !== 'standard' && themes.some(({ value }) => value === legacy)
        ? legacy
        : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'cyberpunk'
          : 'standard';
    setTheme(initial);
    applyTheme(initial);
  }, []);

  return (
    <label className="openface-theme-selector" title="Change OpenFace theme">
      <span aria-hidden="true">{themes.find(({ value }) => value === theme)?.mark}</span>
      <span className="sr-only">Theme</span>
      <select
        aria-label="OpenFace theme"
        value={theme}
        onChange={(event) => {
          const nextTheme = event.target.value as ThemeName;
          setTheme(nextTheme);
          applyTheme(nextTheme);
        }}
      >
        {themes.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
  );
}
