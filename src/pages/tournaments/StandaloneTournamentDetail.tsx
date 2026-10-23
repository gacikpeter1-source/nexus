/**
 * Management page for a standalone (plain, no club/team) tournament —
 * reuses TournamentBracketSection (the same groups/matches/standings UI as
 * the club-tournament results page) wired to the standaloneTournaments
 * service instead of nominations.ts. Only the creator (or an admin) can
 * reach this page — Firestore rules enforce the same restriction server-side.
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import {
  subscribeToStandaloneTournament,
  updateStandaloneTournamentBracket,
  updateStandaloneCombatBracket,
  updateStandaloneTournamentDetails,
  deleteStandaloneTournament,
  ensureTvShortCode,
  finalizeStandaloneTournamentStats,
} from '../../services/firebase/standaloneTournaments';
import { getUserClubs } from '../../services/firebase/clubs';
import TournamentBracketSection from '../../components/team/TournamentBracketSection';
import CombatBracketSection from '../../components/team/CombatBracketSection';
import { getShareableOrigin } from '../../config/siteOrigin';
import type { StandaloneTournament, Club } from '../../types';

export default function StandaloneTournamentDetail() {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();

  const [tournament, setTournament] = useState<StandaloneTournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [copiedMobile, setCopiedMobile] = useState(false);
  const [copiedTv, setCopiedTv] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState<number | null>(null);

  const [editingDetails, setEditingDetails] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editClubId, setEditClubId] = useState('');
  const [editTeamId, setEditTeamId] = useState('');
  const [myClubs, setMyClubs] = useState<Club[]>([]);

  // Club/team this tournament is linked to (if any) grants that club's
  // staff the same full access as the creator — see
  // StandaloneTournament.clubId and isStandaloneTournamentStaff in
  // firestore.rules.
  const [isClubStaff, setIsClubStaff] = useState(false);

  useEffect(() => {
    if (!tournamentId) return;
    const unsub = subscribeToStandaloneTournament(tournamentId, t => {
      setTournament(t);
      setLoading(false);
    });
    return unsub;
  }, [tournamentId]);

  useEffect(() => {
    if (!user) return;
    getUserClubs(user.id).then(setMyClubs).catch(err => console.error('StandaloneTournamentDetail: load clubs failed', err));
  }, [user?.id]);

  useEffect(() => {
    if (!user || !tournament?.clubId) { setIsClubStaff(false); return; }
    const clubId = tournament.clubId;
    getDoc(doc(db, 'clubs', clubId))
      .then(snap => {
        if (!snap.exists()) { setIsClubStaff(false); return; }
        const club = snap.data();
        setIsClubStaff(
          club.ownerId === user.id ||
          (club.trainers || []).includes(user.id) ||
          (club.assistants || []).includes(user.id)
        );
      })
      .catch(err => { console.error('StandaloneTournamentDetail: club staff check failed', err); setIsClubStaff(false); });
  }, [user, tournament?.clubId]);

  // Backfill a short TV code for tournaments created before it existed —
  // the subscription above picks up the write and re-renders once it lands.
  useEffect(() => {
    if (!tournamentId || !tournament || tournament.shortCode) return;
    const isCreatorOrAdmin = !!user && (tournament.creatorId === user.id || user.role === 'admin');
    if (!isCreatorOrAdmin) return;
    ensureTvShortCode(tournamentId).catch(err =>
      console.error('StandaloneTournamentDetail: short code backfill failed', err)
    );
  }, [tournamentId, tournament, user]);

  if (loading) {
    return (
      <Container>
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-cyan" />
        </div>
      </Container>
    );
  }

  if (!tournament) {
    return (
      <Container>
        <div className="py-16 text-center">
          <h1 className="text-lg font-bold text-text-primary mb-2">{t('nominations.notFound')}</h1>
          <Link to="/tools/tournaments" className="text-app-cyan hover:text-app-cyan/80">{t('tools.title')}</Link>
        </div>
      </Container>
    );
  }

  const isOwner = !!user && (tournament.creatorId === user.id || user.role === 'admin');
  const canManage = isOwner || isClubStaff;
  const selectedEditClub = myClubs.find(c => c.id === editClubId);
  const mobileUrl = `${getShareableOrigin()}/tournament/${tournamentId}`;
  const tvUrl = `${getShareableOrigin()}/tv/${tournamentId}`;
  const tvShortUrl = tournament.shortCode ? `${getShareableOrigin()}/t/${tournament.shortCode}` : '';

  const copyMobileUrl = () => {
    navigator.clipboard.writeText(mobileUrl);
    setCopiedMobile(true);
    setTimeout(() => setCopiedMobile(false), 2000);
  };
  const copyTvUrl = () => {
    navigator.clipboard.writeText(tvShortUrl || tvUrl);
    setCopiedTv(true);
    setTimeout(() => setCopiedTv(false), 2000);
  };

  const startEditDetails = () => {
    setEditTitle(tournament.title);
    setEditDate(tournament.date || '');
    setEditLocation(tournament.location || '');
    setEditClubId(tournament.clubId || '');
    setEditTeamId(tournament.teamId || '');
    setEditingDetails(true);
  };

  const saveDetails = async () => {
    if (!tournamentId || !editTitle.trim()) return;
    setSavingDetails(true);
    try {
      await updateStandaloneTournamentDetails(tournamentId, {
        title: editTitle.trim(),
        date: editDate || undefined,
        location: editLocation.trim() || undefined,
        clubId: editClubId || undefined,
        teamId: editTeamId || undefined,
      });
      setEditingDetails(false);
    } catch (err) {
      console.error('StandaloneTournamentDetail: save details failed', err);
      alert(t('nominations.errors.bracketSaveFailed'));
    } finally {
      setSavingDetails(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('nominations.bracket.wizard.standaloneConfirmDelete'))) return;
    setDeleting(true);
    try {
      await deleteStandaloneTournament(tournamentId!);
    } catch (err) {
      console.error('StandaloneTournamentDetail: delete failed', err);
      alert(t('nominations.errors.bracketSaveFailed'));
      setDeleting(false);
    }
  };

  const handleFinalizeStats = async () => {
    if (!tournamentId) return;
    setFinalizing(true);
    setFinalizeResult(null);
    try {
      const synced = await finalizeStandaloneTournamentStats(tournamentId);
      setFinalizeResult(synced);
    } catch (err) {
      console.error('StandaloneTournamentDetail: finalize stats failed', err);
      alert(t('nominations.errors.bracketSaveFailed'));
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <Container>
      <div className="py-6 max-w-2xl mx-auto space-y-4">
        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            {editingDetails ? (
              <div className="flex-1 space-y-2">
                <input
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm font-bold bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                />
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={editDate}
                    onChange={e => setEditDate(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                  />
                  <input
                    value={editLocation}
                    onChange={e => setEditLocation(e.target.value)}
                    placeholder={t('nominations.bracket.wizard.standaloneLocation')}
                    className="flex-1 px-2.5 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                  />
                </div>
                {myClubs.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[9px] text-text-muted">{t('nominations.bracket.wizard.standaloneClubLinkHint')}</p>
                    <div className="flex gap-2">
                      <select
                        value={editClubId}
                        onChange={e => { setEditClubId(e.target.value); setEditTeamId(''); }}
                        className="flex-1 px-2.5 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                      >
                        <option value="">{t('nominations.bracket.wizard.standaloneNoClub')}</option>
                        {myClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <select
                        value={editTeamId}
                        onChange={e => setEditTeamId(e.target.value)}
                        disabled={!selectedEditClub}
                        className="flex-1 px-2.5 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary disabled:opacity-50"
                      >
                        <option value="">—</option>
                        {(selectedEditClub?.teams || []).map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
                      </select>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={saveDetails}
                    disabled={savingDetails || !editTitle.trim()}
                    className="px-3 py-1.5 text-xs font-semibold bg-gradient-primary text-white rounded-lg disabled:opacity-50"
                  >
                    {savingDetails ? t('common.saving') : t('common.save')}
                  </button>
                  <button
                    onClick={() => setEditingDetails(false)}
                    disabled={savingDetails}
                    className="px-3 py-1.5 text-xs font-semibold bg-app-secondary border border-white/10 text-text-secondary rounded-lg disabled:opacity-50"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-text-primary truncate">{tournament.title}</h1>
                  {canManage && (
                    <button
                      onClick={startEditDetails}
                      className="flex-shrink-0 text-text-muted hover:text-app-cyan transition-colors"
                      title={t('common.edit')}
                    >
                      ✎
                    </button>
                  )}
                </div>
                {tournament.date && (
                  <p className="text-xs text-text-secondary mt-0.5">
                    {new Date(tournament.date + 'T00:00:00').toLocaleDateString()}
                  </p>
                )}
                {tournament.location && <p className="text-xs text-text-muted mt-0.5">{tournament.location}</p>}
                {tournament.clubId && (() => {
                  const linkedClub = myClubs.find(c => c.id === tournament.clubId);
                  const linkedTeam = linkedClub?.teams.find(tm => tm.id === tournament.teamId);
                  return linkedClub ? (
                    <p className="text-[10px] text-app-cyan mt-0.5">
                      {linkedClub.name}{linkedTeam ? ` · ${linkedTeam.name}` : ''}
                    </p>
                  ) : null;
                })()}
              </div>
            )}
            <div className="flex-shrink-0 flex flex-col sm:flex-row gap-2">
              <a
                href={`/tournament/${tournamentId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-xs font-semibold bg-app-secondary border border-white/10 text-app-cyan rounded-lg hover:border-app-cyan transition-colors text-center"
              >
                {t('nominations.bracket.openMobile')}
              </a>
              <a
                href={`/tv/${tournamentId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-xs font-semibold bg-app-secondary border border-white/10 text-app-cyan rounded-lg hover:border-app-cyan transition-colors text-center"
              >
                {t('nominations.bracket.openTv')}
              </a>
            </div>
          </div>

          {/* Plain, readable/copyable URLs — not everyone setting up the TV
              display (a barista, a rink staffer) has the app, so the trainer
              needs to be able to just hand them this text directly. */}
          <div className="pt-2 border-t border-white/5 space-y-2">
            <div className="bg-app-secondary border border-white/10 rounded-lg p-2.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-[10px] text-text-muted">{t('tv.scanToFollow')}</p>
                <button
                  onClick={copyMobileUrl}
                  className="flex-shrink-0 text-[10px] font-semibold text-app-cyan hover:text-app-cyan/80 transition-colors"
                >
                  {copiedMobile ? t('common.copied') : t('common.copyLink')}
                </button>
              </div>
              <p className="text-xs text-text-primary break-all font-mono">{mobileUrl}</p>
            </div>
            <div className="bg-app-secondary border border-white/10 rounded-lg p-2.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-[10px] text-text-muted">{t('nominations.bracket.wizard.standaloneTvUrlLabel')}</p>
                <button
                  onClick={copyTvUrl}
                  className="flex-shrink-0 text-[10px] font-semibold text-app-cyan hover:text-app-cyan/80 transition-colors"
                >
                  {copiedTv ? t('common.copied') : t('common.copyLink')}
                </button>
              </div>
              {tournament.shortCode && (
                <p className="text-xl font-bold text-app-cyan tracking-widest font-mono">{tournament.shortCode}</p>
              )}
              <p className="text-xs text-text-primary break-all font-mono mt-0.5">{tvShortUrl || tvUrl}</p>
              <p className="text-[9px] text-text-muted mt-1">{t('nominations.bracket.wizard.standaloneTvCodeHint')}</p>
            </div>
          </div>
        </div>

        {tournament.combatBracket ? (
          <CombatBracketSection
            bracket={tournament.combatBracket}
            isStaff={canManage}
            sport={tournament.sport}
            onUpdateBracket={bracket => updateStandaloneCombatBracket(tournamentId!, bracket)}
          />
        ) : (
          <TournamentBracketSection
            id={tournamentId!}
            bracket={tournament.bracket || { groups: [], matches: [] }}
            isStaff={canManage}
            sport={tournament.sport}
            onUpdateBracket={bracket => updateStandaloneTournamentBracket(tournamentId!, bracket)}
          />
        )}

        {canManage && !tournament.combatBracket &&
          Object.values(tournament.linkedTeams || {}).some(l => l.teamId) && (
          <div className="bg-app-card shadow-card rounded-2xl border border-white/10 p-4 sm:p-5 space-y-2">
            <h2 className="text-sm font-bold text-text-primary">{t('nominations.bracket.wizard.standaloneFinalizeStatsTitle')}</h2>
            <p className="text-xs text-text-secondary">{t('nominations.bracket.wizard.standaloneFinalizeStatsDesc')}</p>
            <button
              onClick={handleFinalizeStats}
              disabled={finalizing}
              className="px-3 py-1.5 text-xs font-semibold bg-app-secondary border border-white/10 text-app-cyan rounded-lg hover:border-app-cyan transition-colors disabled:opacity-50"
            >
              {finalizing ? t('common.loading') : t('nominations.bracket.wizard.standaloneFinalizeStatsButton')}
            </button>
            {finalizeResult !== null && (
              <p className="text-[10px] text-chart-cyan">
                {t('nominations.bracket.wizard.standaloneFinalizeStatsSynced', { count: finalizeResult })}
              </p>
            )}
            {tournament.statsFinalizedAt && (
              <p className="text-[10px] text-text-muted">
                {t('nominations.bracket.wizard.standaloneFinalizeStatsLastSync')}{' '}
                {new Date(
                  (tournament.statsFinalizedAt as any)?.toDate
                    ? (tournament.statsFinalizedAt as any).toDate()
                    : tournament.statsFinalizedAt
                ).toLocaleString()}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <Link to="/tools/tournaments" className="inline-flex items-center gap-1.5 text-xs text-app-cyan hover:text-app-cyan/80 transition-colors">
            ← {t('tools.title')}
          </Link>
          {canManage && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs text-text-muted hover:text-chart-pink transition-colors disabled:opacity-50"
            >
              {deleting ? t('common.saving') : t('common.delete')}
            </button>
          )}
        </div>
      </div>
    </Container>
  );
}
