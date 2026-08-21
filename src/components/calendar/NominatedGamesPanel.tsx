/**
 * Nominated Games Panel
 * Additive, read-only panel — surfaces confirmed nomination-list games
 * (see services/firebase/nominations.ts) on the Calendar and Child Schedule
 * pages. A nominated athlete only shows up here once they've confirmed;
 * declined or still-pending nominations never appear.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { getUserNominations } from '../../services/firebase/nominations';
import type { Nomination, NominationEntry } from '../../types';

interface Props {
  clubIds: string[];
  recipientId: string;       // must be the logged-in user's own id (Firestore rule requirement)
  filterAthleteId?: string;  // optional: narrow to one specific athlete (e.g. one child)
}

interface ConfirmedGame {
  clubId: string;
  nomination: Nomination;
  entry: NominationEntry;
}

export default function NominatedGamesPanel({ clubIds, recipientId, filterAthleteId }: Props) {
  const { t } = useLanguage();
  const [games, setGames] = useState<ConfirmedGame[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (clubIds.length > 0 && recipientId) load();
    else setLoading(false);
  }, [clubIds.join(','), recipientId, filterAthleteId]);

  const load = async () => {
    setLoading(true);
    try {
      const perClub = await Promise.all(
        clubIds.map(async clubId => {
          const noms = await getUserNominations(clubId, recipientId);
          return noms.flatMap(nomination =>
            Object.values(nomination.primary)
              .filter(entry =>
                entry.status === 'confirmed' &&
                entry.recipientIds.includes(recipientId) &&
                (!filterAthleteId || entry.athleteId === filterAthleteId)
              )
              .map(entry => ({ clubId, nomination, entry }))
          );
        })
      );
      setGames(perClub.flat());
    } catch (err) {
      console.error('NominatedGamesPanel: load failed', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || games.length === 0) return null;

  return (
    <div className="bg-app-card rounded-xl border border-white/10 p-3 mb-3 space-y-2">
      <h3 className="text-xs font-semibold text-text-primary">{t('nominations.confirmedGamesTitle')}</h3>
      <div className="space-y-1.5">
        {games.map(({ clubId, nomination, entry }) => (
          <Link
            key={`${nomination.id}_${entry.athleteId}`}
            to={`/clubs/${clubId}/nominations/${nomination.id}`}
            className="block px-2.5 py-2 bg-app-secondary rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
          >
            <div className="text-xs font-semibold text-text-primary truncate">
              {nomination.title}{entry.isChild ? ` — ${entry.displayName}` : ''}
            </div>
            <div className="text-[10px] text-text-muted truncate">
              {nomination.games.map(g => `${g.date}${g.startTime ? ' ' + g.startTime : ''}${g.opponent ? ' vs ' + g.opponent : ''}`).join(' · ')}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
