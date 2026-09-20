/**
 * Boxscore Review Modal
 * Trainer review/approval step for a scraped league game's goals, assists,
 * and penalties — nothing here is ever auto-credited to a player card.
 * Each entry shows the name as scraped off the league site plus this app's
 * best-guess match (jersey number, then name) pre-selected; the trainer
 * confirms or picks a different roster player (or "— skip —") before
 * approving.
 */

import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { approveLeagueBoxscore, dismissLeagueBoxscore, type LeagueGame } from '../../services/firebase/leagueSchedule';
import type { GameGoalEvent, GamePenaltyEvent } from '../../types';

interface RosterPlayer {
  athleteId: string;
  displayName: string;
}

interface Props {
  game: LeagueGame;
  roster: RosterPlayer[];
  onClose: () => void;
  onDone: () => void;
}

const SKIP = '__skip__';

function PlayerSelect({
  value,
  onChange,
  roster,
  scrapedName,
  scrapedNumber,
}: {
  value: string;
  onChange: (v: string) => void;
  roster: RosterPlayer[];
  scrapedName: string;
  scrapedNumber?: string;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[10px] text-text-muted truncate">
        {scrapedNumber ? `#${scrapedNumber} ` : ''}{scrapedName}
      </p>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
      >
        <option value={SKIP}>{t('leagueBoxscore.skip')}</option>
        {roster.map(p => (
          <option key={p.athleteId} value={p.athleteId}>{p.displayName}</option>
        ))}
      </select>
    </div>
  );
}

export default function BoxscoreReviewModal({ game, roster, onClose, onDone }: Props) {
  const { t } = useLanguage();
  const review = game.boxscoreReview;
  const [busy, setBusy] = useState(false);

  const [scorerPicks, setScorerPicks] = useState<string[]>(
    (review?.goals || []).map(g => g.scorer.suggestedAthleteId || SKIP)
  );
  const [assistPicks, setAssistPicks] = useState<string[][]>(
    (review?.goals || []).map(g => g.assists.map(a => a.suggestedAthleteId || SKIP))
  );
  const [penaltyPicks, setPenaltyPicks] = useState<string[]>(
    (review?.penalties || []).map(p => p.player.suggestedAthleteId || SKIP)
  );

  if (!review) return null;

  const handleApprove = async () => {
    setBusy(true);
    try {
      const goalEvents: GameGoalEvent[] = [];
      review.goals.forEach((g, i) => {
        const scorerId = scorerPicks[i];
        if (!scorerId || scorerId === SKIP) return;
        goalEvents.push({
          id: g.id,
          scorerId,
          assistIds: assistPicks[i].filter(id => id && id !== SKIP),
        });
      });

      const penaltyEvents: GamePenaltyEvent[] = [];
      review.penalties.forEach((p, i) => {
        const playerId = penaltyPicks[i];
        if (!playerId || playerId === SKIP) return;
        penaltyEvents.push({ id: p.id, athleteId: playerId, minutes: p.minutes });
      });

      await approveLeagueBoxscore(game.id, goalEvents, penaltyEvents);
      onDone();
    } catch (err) {
      console.error('BoxscoreReviewModal: approve failed', err);
      alert(t('leagueBoxscore.errors.approveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = async () => {
    if (!confirm(t('leagueBoxscore.confirmDismiss'))) return;
    setBusy(true);
    try {
      await dismissLeagueBoxscore(game.id);
      onDone();
    } catch (err) {
      console.error('BoxscoreReviewModal: dismiss failed', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-3 z-50" onClick={onClose}>
      <div
        className="bg-app-card rounded-2xl border border-white/10 shadow-card max-w-md w-full max-h-[88vh] overflow-y-auto p-4 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-text-primary">{t('leagueBoxscore.title')}</h3>
            <p className="text-[11px] text-text-muted">
              {game.homeTeam} – {game.guestTeam} · {new Date(game.date + 'T00:00:00').toLocaleDateString()}
            </p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-lg leading-none">✕</button>
        </div>

        <p className="text-[11px] text-text-secondary bg-app-blue/10 border border-app-blue/20 rounded-xl p-2.5">
          {t('leagueBoxscore.reviewHint')}
        </p>

        {review.goals.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-text-secondary uppercase">{t('leagueBoxscore.goals')}</p>
            {review.goals.map((g, i) => (
              <div key={g.id} className="bg-app-secondary border border-white/10 rounded-xl p-2.5 space-y-2">
                <p className="text-[10px] text-text-muted">{g.periodLabel} · {g.time}</p>
                <div className="flex items-start gap-2">
                  <span className="text-[10px] text-app-cyan font-semibold pt-1 flex-shrink-0 w-8">{t('leagueBoxscore.goalAbbr')}</span>
                  <PlayerSelect
                    value={scorerPicks[i]}
                    onChange={v => setScorerPicks(prev => prev.map((x, idx) => idx === i ? v : x))}
                    roster={roster}
                    scrapedName={`${g.scorer.name}`}
                    scrapedNumber={g.scorer.number}
                  />
                </div>
                {g.assists.map((a, ai) => (
                  <div key={ai} className="flex items-start gap-2">
                    <span className="text-[10px] text-text-muted font-semibold pt-1 flex-shrink-0 w-8">{t('leagueBoxscore.assistAbbr')}</span>
                    <PlayerSelect
                      value={assistPicks[i][ai]}
                      onChange={v => setAssistPicks(prev => prev.map((row, idx) => idx === i ? row.map((x, aidx) => aidx === ai ? v : x) : row))}
                      roster={roster}
                      scrapedName={a.name}
                      scrapedNumber={a.number}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {review.penalties.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-text-secondary uppercase">{t('leagueBoxscore.penalties')}</p>
            {review.penalties.map((p, i) => (
              <div key={p.id} className="bg-app-secondary border border-white/10 rounded-xl p-2.5 space-y-2">
                <p className="text-[10px] text-text-muted">
                  {p.periodLabel} · {p.time} · {p.infraction} · {p.minutes}'
                </p>
                <PlayerSelect
                  value={penaltyPicks[i]}
                  onChange={v => setPenaltyPicks(prev => prev.map((x, idx) => idx === i ? v : x))}
                  roster={roster}
                  scrapedName={p.player.name}
                  scrapedNumber={p.player.number}
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleDismiss}
            disabled={busy}
            className="flex-1 px-3 py-2.5 text-xs font-semibold bg-app-secondary border border-white/10 text-text-secondary rounded-xl disabled:opacity-50"
          >
            {t('leagueBoxscore.dismiss')}
          </button>
          <button
            onClick={handleApprove}
            disabled={busy}
            className="flex-1 px-3 py-2.5 text-xs font-semibold bg-gradient-primary text-white rounded-xl shadow-button disabled:opacity-50"
          >
            {busy ? t('common.saving') : t('leagueBoxscore.approve')}
          </button>
        </div>
      </div>
    </div>
  );
}
