/**
 * Detects a "webview" browser embedded inside another app (Viber, Facebook,
 * Instagram, Messenger, LINE, WeChat, TikTok, Snapchat, LinkedIn, ...) — the
 * kind you land in after tapping a link shared inside that app, rather than
 * a real Safari/Chrome tab.
 *
 * Google's OAuth sign-in is unreliable or outright blocked inside these:
 * some are explicitly rejected server-side ("disallowed_useragent"), others
 * complete the sign-in but the WebView's isolated storage sandbox never
 * hands the session back to the page — which shows up here as
 * getRedirectResult() silently resolving to null with no user and no error
 * (see AuthContext's pendingRedirectError). There's no reliable code fix for
 * this from inside the page; the only real fix is opening the link in an
 * actual browser instead.
 */
export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|FB_IAB|Instagram|Line\/|Viber|Messenger|MicroMessenger|Snapchat|TikTok|musical_ly|LinkedInApp/i.test(ua);
}
