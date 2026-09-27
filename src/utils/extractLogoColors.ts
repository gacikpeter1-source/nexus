/**
 * Auto-derives a jersey's two colors (body + trim) straight from a club's
 * logo image — quantizes pixels and picks the two most common non-white,
 * opaque colors. Runs entirely client-side via canvas; no server round trip.
 *
 * Falls back to `null` on any failure (image fails to load, or the canvas
 * is "tainted" because the image host doesn't send CORS headers — Firebase
 * Storage download URLs don't always). Callers should fall back to a
 * sensible default color pair rather than break the jersey render.
 */

export interface JerseyColors {
  primary: string;
  secondary: string;
}

export function extractLogoColors(imageUrl: string): Promise<JerseyColors | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const size = 64; // small sample is plenty and keeps this fast
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);

        const { data } = ctx.getImageData(0, 0, size, size);
        const counts = new Map<string, number>();
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 200) continue; // transparent background
          if (r > 235 && g > 235 && b > 235) continue; // near-white background/paper
          const key = `${Math.round(r / 16) * 16},${Math.round(g / 16) * 16},${Math.round(b / 16) * 16}`;
          counts.set(key, (counts.get(key) || 0) + 1);
        }

        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        if (sorted.length === 0) return resolve(null);

        const toHex = (key: string) =>
          '#' + key.split(',').map(n => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('');

        resolve({
          primary: toHex(sorted[0][0]),
          secondary: sorted.length > 1 ? toHex(sorted[1][0]) : toHex(sorted[0][0]),
        });
      } catch {
        resolve(null); // tainted canvas (no CORS) or any other failure
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}
