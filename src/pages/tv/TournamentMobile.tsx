/**
 * Public tournament page for people without a Nexus account, viewed on
 * their own phone — same public data as TournamentTV.tsx (tournamentPublic/
 * {nominationId}, no login) but a normal scrolling mobile page instead of
 * the big-screen board scaled to fit one viewport. This is the link/QR
 * code people actually get by default (see CreateStandaloneTournament.tsx
 * and sendTournamentCreatedEmail); the TV board stays a separate, deliberate
 * choice for casting to an actual screen — reachable from here too.
 */

import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { subscribeToPublicTournament } from '../../services/firebase/tournamentPublic';
import { computeGroupStandings, resolveTeamRef } from '../../utils/tournamentBracket';
import type { PublicTournament } from '../../types';

export default function TournamentMobile() {
  const { nominationId } = useParams<{ nominationId: string }>();
  const { t } = useLanguage();

  const [data, setData] = useState<PublicTournament | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!nominationId) return;
    const unsub = subscribeToPublicTournament(nominationId, d => {
      setData(d);
      setLoading(false);
    });
    return unsub;
  }, [nominationId]);

  const bracket = data?.bracket;

  const standingsByGroup = useMemo(() => {
    if (!bracket) return [];
    return bracket.groups.map(g => ({ group: g, rows: computeGroupStandings(bracket, g.id) }));
  }, [bracket]);

  const liveMatches = useMemo(
    () => (bracket ? bracket.matches.filter(m => m.live) : []),
    [bracket]
  );

  const upcomingMatches = useMemo(() => {
    if (!bracket) return [];
    return bracket.matches
      .filter(m => !m.live && (m.homeScore === undefined || m.awayScore === undefined))
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  }, [bracket]);

  const groupName = (groupId?: string) => bracket?.groups.find(g => g.id === groupId)?.name || '';

  if (loading) {
    return (
      <Container>
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-cyan" />
        </div>
      </Container>
    );
  }

  if (!data || !bracket) {
    return (
      <Container>
        <div className="py-16 text-center">
          <p className="text-sm text-text-secondary">{t('tv.notFound')}</p>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div className="py-4 sm:py-6 max-w-xl mx-auto space-y-3">

        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-text-primary break-words">{data.title}</h1>
              {data.location && <p className="text-xs text-text-muted mt-0.5">{data.location}</p>}
            </div>
            {liveMatches.length > 0 && (
              <span className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-500/15 border border-red-500/30 text-red-400 rounded-full text-[10px] font-bold uppercase tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                {t('nominations.bracket.live')}
              </span>
            )}
          </div>
          <Link
            to={`/tv/${nominationId}`}
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-app-cyan hover:text-app-cyan/80 transition-colors"
          >
            {t('nominations.bracket.openTv')}
          </Link>
        </div>

        {liveMatches.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-text-muted px-1">{t('tv.liveNow')}</h2>
            <div className="space-y-2">
              {liveMatches.map(m => (
                <div key={m.id} className="bg-app-card rounded-xl border border-red-500/25 p-3">
                  <div className="flex items-center justify-between text-[10px] text-text-muted mb-1.5">
                    <span>{m.groupId ? `${t('nominations.group')} ${groupName(m.groupId)}` : (m.label || '')}</span>
                    {m.surface && <span className="text-app-cyan font-semibold">{m.surface}</span>}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex-1 min-w-0 text-sm font-semibold text-text-primary truncate">{resolveTeamRef(m.home, bracket)}</span>
                    <span className="flex-shrink-0 text-lg font-bold text-app-cyan tabular-nums">
                      {m.homeScore ?? '–'}:{m.awayScore ?? '–'}
                    </span>
                    <span className="flex-1 min-w-0 text-sm font-semibold text-text-primary text-right truncate">{resolveTeamRef(m.away, bracket)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {standingsByGroup.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-text-muted px-1">{t('tv.standings')}</h2>
            <div className="space-y-3">
              {standingsByGroup.map(({ group, rows }) => (
                <div key={group.id} className="bg-app-card rounded-xl border border-white/10 overflow-hidden">
                  <div className="px-3 py-2 bg-white/5 border-b border-white/10">
                    <span className="text-xs font-bold text-text-primary">{t('nominations.group')} {group.name}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-text-muted">
                          <th className="text-left font-medium px-3 py-1.5">{t('nominations.team')}</th>
                          <th className="font-medium px-1.5 py-1.5">Z</th>
                          <th className="font-medium px-1.5 py-1.5">V</th>
                          <th className="font-medium px-1.5 py-1.5">R</th>
                          <th className="font-medium px-1.5 py-1.5">P</th>
                          <th className="font-medium px-2 py-1.5">Skóre</th>
                          <th className="font-medium px-2 py-1.5">B</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr key={row.team} className={`border-t border-white/5 ${i === 0 ? 'bg-app-cyan/5' : ''}`}>
                            <td className="px-3 py-1.5 text-text-primary font-medium truncate max-w-[120px]">{row.team}</td>
                            <td className="text-center px-1.5 py-1.5 text-text-secondary tabular-nums">{row.played}</td>
                            <td className="text-center px-1.5 py-1.5 text-text-secondary tabular-nums">{row.won}</td>
                            <td className="text-center px-1.5 py-1.5 text-text-secondary tabular-nums">{row.drawn}</td>
                            <td className="text-center px-1.5 py-1.5 text-text-secondary tabular-nums">{row.lost}</td>
                            <td className="text-center px-2 py-1.5 text-text-secondary tabular-nums">{row.goalsFor}:{row.goalsAgainst}</td>
                            <td className="text-center px-2 py-1.5 text-text-primary font-bold tabular-nums">{row.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {upcomingMatches.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-text-muted px-1">{t('tv.upcoming')}</h2>
            <div className="bg-app-card rounded-xl border border-white/10 divide-y divide-white/5">
              {upcomingMatches.map(m => (
                <div key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                  {m.startTime && (
                    <span className="flex-shrink-0 text-xs font-bold text-app-cyan tabular-nums w-11">{m.startTime}</span>
                  )}
                  <span className="flex-1 min-w-0 text-xs text-text-primary truncate">
                    {resolveTeamRef(m.home, bracket)} – {resolveTeamRef(m.away, bracket)}
                  </span>
                  {(m.surface || m.groupId || m.label) && (
                    <span className="flex-shrink-0 text-[10px] text-text-muted">{m.surface || groupName(m.groupId) || m.label}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <p className="text-[10px] text-text-muted text-center px-4 pt-2">{t('tv.footerNote')}</p>
      </div>
    </Container>
  );
}
