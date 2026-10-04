/**
 * Lowercases and strips diacritics so a name search matches regardless of
 * accents — e.g. typing "Tazik" (no diacritics, easier on a phone keyboard)
 * still matches "Tažik". Needed everywhere we do a plain name search in
 * this app, since Slovak (the default locale) names are full of them.
 */
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}
