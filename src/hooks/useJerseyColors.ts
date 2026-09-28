import { useEffect, useState } from 'react';
import { extractLogoColors } from '../utils/extractLogoColors';
import type { JerseyColors } from '../components/lineup/JerseyIcon';

const DEFAULT_COLORS: JerseyColors = { primary: '#0066FF', secondary: '#00D4FF' }; // app-blue/app-cyan fallback when there's no logo (or it can't be read)

export function contrastColor(hex: string): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16), g = parseInt(c.substring(2, 4), 16), b = parseInt(c.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#111318' : '#FFFFFF';
}

/** Jersey body/trim colors auto-derived from a club's logo, shared by every sport's lineup board. */
export function useJerseyColors(clubLogoUrl?: string): JerseyColors {
  const [colors, setColors] = useState<JerseyColors>(DEFAULT_COLORS);

  useEffect(() => {
    if (!clubLogoUrl) { setColors(DEFAULT_COLORS); return; }
    let cancelled = false;
    extractLogoColors(clubLogoUrl).then(result => {
      if (!cancelled) setColors(result || DEFAULT_COLORS);
    });
    return () => { cancelled = true; };
  }, [clubLogoUrl]);

  return colors;
}
