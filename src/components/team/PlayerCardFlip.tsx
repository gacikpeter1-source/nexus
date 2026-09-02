/**
 * PlayerCardFlip — click the rink-framed front face to flip the card over
 * and reveal the athlete's stats on the back. Used by Stats > Team Cards.
 */

import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import PlayerCardFront from './PlayerCardFront';
import type { PlayerCard } from '../../types';

export interface PlayerCardStats {
  games: number;
  goals: number;
  assists: number;
  penaltyMinutes: number;
  saves: number;
  goalsAgainst: number;
}

interface Props {
  athleteName: string;
  photoURL?: string;
  card?: PlayerCard;
  stats?: PlayerCardStats;
  attendanceRate: number | null;
}

export default function PlayerCardFlip({ athleteName, photoURL, card, stats, attendanceRate }: Props) {
  const { t } = useLanguage();
  const [flipped, setFlipped] = useState(false);
  const isGoalie = card?.position === 'goalie';
  const s: PlayerCardStats = stats || { games: 0, goals: 0, assists: 0, penaltyMinutes: 0, saves: 0, goalsAgainst: 0 };

  return (
    <div
      onClick={() => setFlipped(f => !f)}
      className="relative cursor-pointer [perspective:1000px]"
      style={{ aspectRatio: '768 / 1376' }}
    >
      <div
        className="relative w-full h-full transition-transform duration-500 [transform-style:preserve-3d]"
        style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
      >
        {/* Front */}
        <div className="absolute inset-0 [backface-visibility:hidden]">
          <PlayerCardFront athleteName={athleteName} photoURL={photoURL} jerseyNumber={card?.jerseyNumber} />
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 [backface-visibility:hidden] rounded-xl bg-app-card border border-white/10 p-2.5 sm:p-3 flex flex-col"
          style={{ transform: 'rotateY(180deg)' }}
        >
          <span className="text-xs sm:text-sm font-bold text-text-primary text-center truncate mb-2">{athleteName}</span>
          <div className="flex-1 space-y-1 sm:space-y-1.5 text-[10px] sm:text-[11px] overflow-y-auto">
            <StatRow label={t('cards.position')} value={card?.position ? t(`cards.positions.${card.position}`) : '—'} />
            <StatRow label={t('cards.handednessLabel')} value={card?.handedness ? t(`cards.handedness.${card.handedness}`) : '—'} />
            <StatRow label={t('stats.cards.games')} value={String(s.games)} />
            {isGoalie ? (
              <>
                <StatRow label={t('goalie.saves')} value={String(s.saves)} />
                <StatRow label={t('gameStats.goalsAgainst')} value={String(s.goalsAgainst)} />
              </>
            ) : (
              <>
                <StatRow label={t('stats.goals')} value={String(s.goals)} />
                <StatRow label={t('stats.cards.assists')} value={String(s.assists)} />
              </>
            )}
            <StatRow label={t('stats.cards.penalty')} value={`${s.penaltyMinutes}'`} />
            <StatRow label={t('stats.cards.attendance')} value={attendanceRate !== null ? `${attendanceRate}%` : '—'} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 pb-1">
      <span className="text-text-muted">{label}</span>
      <span className="text-text-primary font-semibold">{value}</span>
    </div>
  );
}
