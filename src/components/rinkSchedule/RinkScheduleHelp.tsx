/**
 * Static help modal for RinkScheduleHub, explaining the "one hall per
 * section" trick for splitting a rink/court into simultaneous parts (e.g.
 * cross-ice thirds) — the tool has no dedicated concept for this, a Hall is
 * just a schedule row/lane that can represent a slice of a bigger surface.
 */

import { useLanguage } from '../../contexts/LanguageContext';

export default function RinkScheduleHelp({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-app-card w-full max-w-md rounded-2xl border border-white/10 p-4 space-y-3 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold text-text-primary">{t('rinkSchedule.helpTitle')}</h3>
        <div className="space-y-2.5 text-xs text-text-secondary leading-relaxed">
          <p>{t('rinkSchedule.helpP1')}</p>
          <p>{t('rinkSchedule.helpP2')}</p>
          <p>{t('rinkSchedule.helpP3')}</p>
          <p>{t('rinkSchedule.helpP4')}</p>
          <p>{t('rinkSchedule.helpP5')}</p>
        </div>
        <button
          onClick={onClose}
          className="w-full px-3 py-2 text-sm font-semibold bg-gradient-primary text-white rounded-lg shadow-button"
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
