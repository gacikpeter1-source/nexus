/**
 * Help / Handbook — the full bilingual (SK/EN) Nexus guide, embedded from
 * public/help.html. Reachable at /help for any signed-in user (this route
 * sits inside App.tsx's ProtectedRoute-wrapped block, same as every other
 * in-app page) and linked from the sidebar. The guide is a self-contained
 * static page with its own language toggle and styling — kept as one file
 * rather than ported into the app's own i18n system so it stays a single
 * thing to update, independent of app releases.
 *
 * Note: public/help.html is a plain static asset, so it's technically
 * reachable by anyone who guesses the direct URL — this route only gates
 * in-app *navigation* to it. There's nothing sensitive in the content
 * (no user data, just how-to instructions), so that's an accepted tradeoff.
 */

import { useLanguage } from '../contexts/LanguageContext';

export default function Help() {
  const { t } = useLanguage();

  return (
    <div className="px-3 sm:px-4 md:px-6 lg:px-8">
      <iframe
        src="/help.html"
        title={t('help.title')}
        className="w-full border-0 rounded-2xl shadow-card"
        style={{ height: 'calc(100dvh - 160px)', minHeight: 560 }}
      />
    </div>
  );
}
