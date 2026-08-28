import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';

interface GoalieStats {
  name: string;
  goals: number;
  saves: number;
}

const EMPTY_STATS = (name: string): GoalieStats => ({ name, goals: 0, saves: 0 });

function GoaliePanel({
  stats,
  onChange,
}: {
  stats: GoalieStats;
  onChange: (next: GoalieStats) => void;
}) {
  const { t } = useLanguage();
  const shots = stats.goals + stats.saves;
  const goalPct = shots > 0 ? ((stats.goals / shots) * 100).toFixed(1) : '0.0';
  const savePct = shots > 0 ? ((stats.saves / shots) * 100).toFixed(1) : '0.0';

  return (
    <div className="bg-app-secondary border border-white/10 rounded-xl p-2.5 sm:p-3.5 flex flex-col items-center">
      <input
        value={stats.name}
        onChange={(e) => onChange({ ...stats, name: e.target.value })}
        className="w-full bg-transparent border-b-2 border-white/10 text-text-primary font-bold text-[11px] sm:text-sm text-center outline-none pb-1.5 mb-3 focus:border-app-cyan transition-colors"
      />

      <div className="grid grid-cols-3 gap-1 w-full mb-3">
        <div className="text-center">
          <div className="text-lg sm:text-2xl md:text-3xl font-bold text-text-primary leading-none">{shots}</div>
          <div className="text-[8px] sm:text-[9px] text-text-muted uppercase font-semibold mt-1">{t('goalie.shots')}</div>
        </div>
        <div className="text-center">
          <div className="text-lg sm:text-2xl md:text-3xl font-bold text-red-500 leading-none">{stats.goals}</div>
          <div className="text-[8px] sm:text-[9px] text-text-muted uppercase font-semibold mt-1">{t('goalie.goals')}</div>
        </div>
        <div className="text-center">
          <div className="text-lg sm:text-2xl md:text-3xl font-bold text-green-500 leading-none">{stats.saves}</div>
          <div className="text-[8px] sm:text-[9px] text-text-muted uppercase font-semibold mt-1">{t('goalie.saves')}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:gap-2 w-full mb-3">
        <div className="rounded-lg py-2 text-center bg-red-500/10 border border-red-500/25">
          <div className="text-xs sm:text-base font-bold text-red-500">{goalPct}%</div>
          <div className="text-[7px] sm:text-[8px] text-red-500/70 uppercase font-semibold mt-0.5">{t('goalie.goalPct')}</div>
        </div>
        <div className="rounded-lg py-2 text-center bg-green-500/10 border border-green-500/25">
          <div className="text-xs sm:text-base font-bold text-green-500">{savePct}%</div>
          <div className="text-[7px] sm:text-[8px] text-green-500/70 uppercase font-semibold mt-0.5">{t('goalie.savePct')}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:gap-2 w-full mb-2">
        <button
          onClick={() => onChange({ ...stats, saves: stats.saves + 1 })}
          className="py-3 sm:py-4 rounded-xl border-2 border-green-500 bg-green-500/10 text-green-500 font-bold text-[10px] sm:text-xs active:scale-95 transition-transform"
        >
          🧤 {t('goalie.save')}
        </button>
        <button
          onClick={() => onChange({ ...stats, goals: stats.goals + 1 })}
          className="py-3 sm:py-4 rounded-xl border-2 border-red-500 bg-red-500/10 text-red-500 font-bold text-[10px] sm:text-xs active:scale-95 transition-transform"
        >
          🚨 {t('goalie.goal')}
        </button>
      </div>

      <button
        onClick={() => onChange({ ...stats, goals: 0, saves: 0 })}
        className="w-full py-2 rounded-lg border border-white/10 bg-white/5 text-text-muted font-semibold text-[9px] sm:text-[10px] hover:bg-white/10 transition-colors"
      >
        ↺ {t('goalie.reset')}
      </button>
    </div>
  );
}

export default function GoalieTrackerTab() {
  const { t } = useLanguage();
  const [goalie1, setGoalie1] = useState<GoalieStats>(() => EMPTY_STATS(t('goalie.goalie1')));
  const [goalie2, setGoalie2] = useState<GoalieStats>(() => EMPTY_STATS(t('goalie.goalie2')));

  return (
    <div className="space-y-3 sm:space-y-4">
      <h2 className="text-sm sm:text-base md:text-lg font-bold text-text-primary">
        {t('goalie.title')}
      </h2>

      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <GoaliePanel stats={goalie1} onChange={setGoalie1} />
        <GoaliePanel stats={goalie2} onChange={setGoalie2} />
      </div>

      <p className="text-[10px] sm:text-[11px] text-text-muted text-center">
        {t('goalie.hint')}
      </p>
    </div>
  );
}
