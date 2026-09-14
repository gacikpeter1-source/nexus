/**
 * Canonical public origin for links/QR codes meant to be shared outside the
 * app (team join links, etc.) — fixed to the real production domain rather
 * than window.location.origin, so a trainer who's still on an old bookmark
 * to a previous domain doesn't hand out a link tied to that instead of the
 * actual app. Falls back to the live origin on localhost so local
 * development still generates a link that works on your own machine.
 */
const SITE_ORIGIN = 'https://nexuscb.app';

export function getShareableOrigin(): string {
  if (typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
    return window.location.origin;
  }
  return SITE_ORIGIN;
}
