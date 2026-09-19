/**
 * Tournament Registration Detail
 * One page, two roles: the organizer manages invites and closes
 * registration; any club the viewer manages that's been invited here gets
 * its own response panel (accept with a squad name — possibly more than
 * once — or decline). Everyone who can see the page sees the same list of
 * who's responded.
 */

import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import {
  getTournamentRegistration,
  getRegistrationEntries,
  inviteClubToRegistration,
  respondToRegistrationEntry,
  addOwnRegistrationEntry,
  closeTournamentRegistration,
  reopenTournamentRegistration,
  deleteRegistrationEntry,
} from '../../services/firebase/tournamentRegistrations';
import { getClub } from '../../services/firebase/clubs';
import type { TournamentRegistration, RegistrationEntry, Club } from '../../types';

export default function TournamentRegistrationDetail() {
  const { registrationId } = useParams<{ registrationId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();

  const [registration, setRegistration] = useState<TournamentRegistration | null>(null);
  const [entries, setEntries] = useState<RegistrationEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [directory, setDirectory] = useState<Club[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [search, setSearch] = useState('');

  const [squadNameDrafts, setSquadNameDrafts] = useState<Record<string, string>>({});
  const [teamChoiceDrafts, setTeamChoiceDrafts] = useState<Record<string, string>>({});
  const [myClubs, setMyClubs] = useState<Record<string, Club>>({});
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);
  // An already-accepted/declined entry is read-only until its trainer opts
  // into changing it — covers "picked the wrong team" or "roster renamed".
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  useEffect(() => {
    if (registrationId) load(registrationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrationId]);

  const load = async (id: string) => {
    setLoading(true);
    try {
      const [reg, entryList] = await Promise.all([getTournamentRegistration(id), getRegistrationEntries(id)]);
      setRegistration(reg);
      setEntries(entryList);
    } catch (err) {
      console.error('Error loading tournament registration:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!showInvite || directory.length > 0) return;
    getDocs(collection(db, 'clubs'))
      .then(snap => setDirectory(snap.docs.map(d => ({ id: d.id, ...d.data() } as Club))))
      .catch(err => console.error('TournamentRegistrationDetail: load clubs failed', err));
  }, [showInvite, directory.length]);

  // Full club docs (with their teams[]) for every club the viewer has an
  // entry under — lets the response panel offer "which of your teams is
  // this?" so an accepted entry can later be credited to that team's stats.
  const myEntryClubIds = useMemo(
    () => [...new Set(entries.filter(e => e.clubId && user?.clubIds?.includes(e.clubId)).map(e => e.clubId!))],
    [entries, user?.clubIds]
  );
  useEffect(() => {
    const missing = myEntryClubIds.filter(id => !myClubs[id]);
    if (missing.length === 0) return;
    Promise.all(missing.map(id => getClub(id)))
      .then(clubs => {
        const updates: Record<string, Club> = {};
        clubs.forEach(c => { if (c) updates[c.id] = c; });
        setMyClubs(prev => ({ ...prev, ...updates }));
      })
      .catch(err => console.error('TournamentRegistrationDetail: load own clubs failed', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myEntryClubIds.join('|')]);

  // A club with exactly one team has nothing to disambiguate — pick it for
  // them so a single-team club can just tap Accept, no dropdown needed.
  useEffect(() => {
    const updates: Record<string, string> = {};
    for (const entry of entries) {
      if (entry.status !== 'pending' || !entry.clubId || teamChoiceDrafts[entry.id]) continue;
      const teams = myClubs[entry.clubId]?.teams;
      if (teams?.length === 1) updates[entry.id] = teams[0].id;
    }
    if (Object.keys(updates).length > 0) {
      setTeamChoiceDrafts(prev => ({ ...updates, ...prev }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, myClubs]);

  if (loading) {
    return (
      <Container>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-cyan mx-auto"></div>
        </div>
      </Container>
    );
  }

  if (!registration) {
    return (
      <Container>
        <div className="text-center py-12">
          <h2 className="text-lg font-bold text-text-primary mb-3">{t('tournamentRegistration.notFound')}</h2>
          <Link to="/tools/tournaments" className="inline-block px-4 py-2 text-xs bg-gradient-primary text-white rounded-lg shadow-button font-semibold">
            {t('tools.title')}
          </Link>
        </div>
      </Container>
    );
  }

  const isOrganizer = !!user && user.id === registration.createdBy;
  const myClubIds = new Set(user?.clubIds || []);
  const myEntries = entries.filter(e => e.clubId && myClubIds.has(e.clubId));
  const myAcceptedClubIds = new Set(myEntries.filter(e => e.status === 'accepted').map(e => e.clubId));

  const searchResults = search.trim().length < 2
    ? []
    : directory
        .filter(c => c.name.toLowerCase().includes(search.trim().toLowerCase()))
        .filter(c => !entries.some(e => e.clubId === c.id))
        .slice(0, 8);

  const handleInvite = async (club: Club) => {
    if (!user || !registrationId) return;
    try {
      await inviteClubToRegistration({
        registrationId,
        clubId: club.id,
        clubName: club.name,
        email: club.contactEmail || undefined,
        invitedBy: user.id,
      });
      setSearch('');
      await load(registrationId);
    } catch (err) {
      console.error('Error inviting club:', err);
    }
  };

  // A typed squad name is only actually needed to tell apart several squads
  // from one club (a big roster split into small-format entries) — with one
  // team picked and nothing typed, that team's own name already says who
  // this is, so the field falls back to it instead of blocking Accept.
  const effectiveSquadName = (entry: RegistrationEntry): string => {
    const typed = squadNameDrafts[entry.id]?.trim();
    if (typed) return typed;
    const teamId = teamChoiceDrafts[entry.id];
    const team = teamId ? myClubs[entry.clubId!]?.teams.find(t => t.id === teamId) : undefined;
    return team?.name || '';
  };

  const handleRespond = async (entryId: string, status: 'accepted' | 'declined') => {
    if (!user) return;
    const entry = entries.find(e => e.id === entryId);
    const squadName = status === 'accepted' && entry ? effectiveSquadName(entry) : squadNameDrafts[entryId]?.trim();
    if (status === 'accepted' && !squadName) return;
    setBusyEntryId(entryId);
    try {
      await respondToRegistrationEntry(entryId, {
        status,
        squadName,
        teamId: status === 'accepted' ? teamChoiceDrafts[entryId] || undefined : undefined,
        respondedBy: user.id,
      });
      setEditingEntryId(null);
      if (registrationId) await load(registrationId);
    } catch (err) {
      console.error('Error responding to registration entry:', err);
    } finally {
      setBusyEntryId(null);
    }
  };

  const startEditing = (entry: RegistrationEntry) => {
    setSquadNameDrafts(prev => ({ ...prev, [entry.id]: entry.squadName || '' }));
    setTeamChoiceDrafts(prev => ({ ...prev, [entry.id]: entry.teamId || '' }));
    setEditingEntryId(entry.id);
  };

  const handleAddAnotherSquad = async (clubId: string, clubName: string) => {
    if (!user || !registrationId) return;
    const draftKey = `extra-${clubId}`;
    const squadName = squadNameDrafts[draftKey]?.trim();
    if (!squadName) return;
    setBusyEntryId(draftKey);
    try {
      await addOwnRegistrationEntry({
        registrationId,
        clubId,
        clubName,
        squadName,
        teamId: teamChoiceDrafts[draftKey] || undefined,
        respondedBy: user.id,
      });
      setSquadNameDrafts(prev => ({ ...prev, [draftKey]: '' }));
      setTeamChoiceDrafts(prev => ({ ...prev, [draftKey]: '' }));
      await load(registrationId);
    } catch (err) {
      console.error('Error adding another squad:', err);
    } finally {
      setBusyEntryId(null);
    }
  };

  const handleToggleStatus = async () => {
    if (!registrationId) return;
    try {
      if (registration.status === 'open') await closeTournamentRegistration(registrationId);
      else await reopenTournamentRegistration(registrationId);
      await load(registrationId);
    } catch (err) {
      console.error('Error toggling registration status:', err);
    }
  };

  const handleRemoveEntry = async (entryId: string) => {
    if (!registrationId) return;
    try {
      await deleteRegistrationEntry(entryId);
      await load(registrationId);
    } catch (err) {
      console.error('Error removing entry:', err);
    }
  };

  const statusBadge = (status: RegistrationEntry['status']) => {
    const cls = status === 'accepted' ? 'bg-chart-cyan/20 text-chart-cyan' : status === 'declined' ? 'bg-chart-pink/20 text-chart-pink' : 'bg-white/10 text-text-muted';
    return <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${cls}`}>{t(`tournamentRegistration.status.${status}`)}</span>;
  };

  return (
    <Container className="max-w-2xl">
      <div className="py-6 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-text-primary">{registration.title}</h1>
            <p className="text-xs text-text-secondary mt-0.5">
              {registration.category && <span>{registration.category} · </span>}
              {t('tournamentRegistration.deadlineLabel')} {new Date(registration.deadline + 'T00:00:00').toLocaleDateString()}
              {' · '}
              <span className={registration.status === 'open' ? 'text-chart-cyan' : 'text-text-muted'}>
                {t(`tournamentRegistration.registrationStatus.${registration.status}`)}
              </span>
            </p>
          </div>
          <Link to="/tools/tournaments" className="text-xs text-app-cyan hover:text-app-cyan/80">
            ← {t('tools.title')}
          </Link>
        </div>

        {isOrganizer && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleToggleStatus}
              className="px-3 py-1.5 text-xs font-semibold bg-app-secondary border border-white/10 text-text-primary rounded-lg hover:border-app-cyan transition-colors"
            >
              {registration.status === 'open' ? t('tournamentRegistration.closeRegistration') : t('tournamentRegistration.reopenRegistration')}
            </button>
            <button
              type="button"
              onClick={() => setShowInvite(v => !v)}
              className="px-3 py-1.5 text-xs font-semibold bg-app-secondary border border-white/10 text-app-cyan rounded-lg hover:border-app-cyan transition-colors"
            >
              + {t('tournamentRegistration.inviteMore')}
            </button>
          </div>
        )}

        {isOrganizer && showInvite && (
          <div className="bg-app-card shadow-card rounded-2xl border border-white/10 p-4 relative">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('tournamentRegistration.searchClubPlaceholder')}
              className="w-full px-3 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
            />
            {searchResults.length > 0 && (
              <div className="mt-1 border border-white/10 rounded-xl overflow-hidden">
                {searchResults.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleInvite(c)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors bg-app-secondary"
                  >
                    <span className="text-sm text-text-primary truncate">{c.name}</span>
                    <span className="text-[10px] text-app-cyan font-semibold flex-shrink-0">{t('common.add')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* This club's own response panel(s) */}
        {myEntries.length > 0 && (
          <div className="bg-app-card shadow-card rounded-2xl border border-app-cyan/30 p-4 sm:p-5 space-y-3">
            <h2 className="text-sm font-bold text-text-primary">{t('tournamentRegistration.yourResponse')}</h2>
            {myEntries.map(entry => (
              <div key={entry.id} className="bg-app-secondary rounded-xl p-3 border border-white/10 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-text-primary">{entry.squadName || entry.clubName}</span>
                  {statusBadge(entry.status)}
                </div>
                {entry.status !== 'pending' && editingEntryId !== entry.id && (
                  <button
                    type="button"
                    onClick={() => startEditing(entry)}
                    className="text-[10px] font-semibold text-app-cyan hover:text-app-cyan/80 transition-colors"
                  >
                    {t('tournamentRegistration.editResponse')}
                  </button>
                )}
                {(entry.status === 'pending' || editingEntryId === entry.id) && (
                  <div className="space-y-1.5">
                    {(myClubs[entry.clubId!]?.teams?.length || 0) > 0 && (
                      <select
                        value={teamChoiceDrafts[entry.id] || ''}
                        onChange={e => setTeamChoiceDrafts(prev => ({ ...prev, [entry.id]: e.target.value }))}
                        className="w-full px-2.5 py-1.5 text-xs bg-app-primary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
                      >
                        <option value="">{t('tournamentRegistration.whichTeamPlaceholder')}</option>
                        {myClubs[entry.clubId!]!.teams.map(team => (
                          <option key={team.id} value={team.id}>{team.name}</option>
                        ))}
                      </select>
                    )}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={squadNameDrafts[entry.id] || ''}
                        onChange={e => setSquadNameDrafts(prev => ({ ...prev, [entry.id]: e.target.value }))}
                        placeholder={
                          teamChoiceDrafts[entry.id]
                            ? myClubs[entry.clubId!]?.teams.find(t => t.id === teamChoiceDrafts[entry.id])?.name || t('tournamentRegistration.squadNamePlaceholder')
                            : t('tournamentRegistration.squadNamePlaceholder')
                        }
                        className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-app-primary border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
                      />
                      <button
                        type="button"
                        onClick={() => handleRespond(entry.id, 'accepted')}
                        disabled={busyEntryId === entry.id || !effectiveSquadName(entry)}
                        className="px-3 py-1.5 text-xs font-semibold bg-gradient-primary text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                      >
                        {t('tournamentRegistration.accept')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRespond(entry.id, 'declined')}
                        disabled={busyEntryId === entry.id}
                        className="px-3 py-1.5 text-xs font-semibold bg-app-primary border border-chart-pink/40 text-chart-pink rounded-lg disabled:opacity-40 flex-shrink-0"
                      >
                        {t('tournamentRegistration.decline')}
                      </button>
                    </div>
                    {editingEntryId === entry.id && (
                      <button
                        type="button"
                        onClick={() => setEditingEntryId(null)}
                        className="text-[10px] text-text-muted hover:text-text-secondary transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}

            {[...myAcceptedClubIds].map(clubId => {
              const club = myEntries.find(e => e.clubId === clubId);
              if (!club) return null;
              const draftKey = `extra-${clubId}`;
              return (
                <div key={draftKey} className="space-y-1.5 pt-1">
                  {(myClubs[clubId!]?.teams?.length || 0) > 0 && (
                    <select
                      value={teamChoiceDrafts[draftKey] || ''}
                      onChange={e => setTeamChoiceDrafts(prev => ({ ...prev, [draftKey]: e.target.value }))}
                      className="w-full px-2.5 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
                    >
                      <option value="">{t('tournamentRegistration.whichTeamPlaceholder')}</option>
                      {myClubs[clubId!]!.teams.map(team => (
                        <option key={team.id} value={team.id}>{team.name}</option>
                      ))}
                    </select>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={squadNameDrafts[draftKey] || ''}
                      onChange={e => setSquadNameDrafts(prev => ({ ...prev, [draftKey]: e.target.value }))}
                      placeholder={t('tournamentRegistration.anotherSquadPlaceholder')}
                      className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddAnotherSquad(clubId!, club.clubName)}
                      disabled={busyEntryId === draftKey || !squadNameDrafts[draftKey]?.trim()}
                      className="px-3 py-1.5 text-xs font-semibold bg-app-secondary border border-white/10 text-app-cyan rounded-lg hover:border-app-cyan disabled:opacity-40 flex-shrink-0"
                    >
                      + {t('tournamentRegistration.addSquad')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Full entry list */}
        <div className="bg-app-card shadow-card rounded-2xl border border-white/10 p-4 sm:p-5 space-y-2">
          <h2 className="text-sm font-bold text-text-primary">{t('tournamentRegistration.entries')} ({entries.length})</h2>
          {entries.length === 0 ? (
            <p className="text-xs text-text-muted py-1">{t('tournamentRegistration.noEntries')}</p>
          ) : (
            <div className="space-y-1.5">
              {entries.map(entry => (
                <div key={entry.id} className="flex items-center gap-2 bg-app-secondary border border-white/10 rounded-lg p-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-text-primary truncate">
                      {entry.squadName || entry.clubName}
                    </p>
                    <p className="text-[10px] text-text-muted truncate">
                      {entry.squadName ? entry.clubName : (entry.clubId ? '' : t('tournamentRegistration.notOnNexus'))}
                      {entry.email && ` · ${entry.email}`}
                    </p>
                  </div>
                  {statusBadge(entry.status)}
                  {isOrganizer && (
                    <button
                      type="button"
                      onClick={() => handleRemoveEntry(entry.id)}
                      className="text-text-muted hover:text-chart-pink text-xs px-1 flex-shrink-0"
                      aria-label={t('common.remove')}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}
