/**
 * Management page for a standalone (plain, no club/team) tournament —
 * reuses TournamentBracketSection (the same groups/matches/standings UI as
 * the club-tournament results page) wired to the standaloneTournaments
 * service instead of nominations.ts. Only the creator (or an admin) can
 * reach this page — Firestore rules enforce the same restriction server-side.
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import {
  subscribeToStandaloneTournament,
  updateStandaloneTournamentBracket,
  deleteStandaloneTournament,
  ensureTvShortCode,
} from '../../services/firebase/standaloneTournaments';
import TournamentBracketSection from '../../components/team/TournamentBracketSection';
import type { StandaloneTournament } from '../../types';

export default function StandaloneTournamentDetail() {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();

  const [tournament, setTournament] = useState<StandaloneTournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [copiedMobile, setCopiedMobile] = useState(false);
  const [copiedTv, setCopiedTv] = useState(false);

  useEffect(() => {
    if (!tournamentId) return;
    const unsub = subscribeToStandaloneTournament(tournamentId, t => {
      setTournament(t);
      setLoading(false);
    });
    return unsub;
  }, [tournamentId]);

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
  const mobileUrl = `${window.location.origin}/tournament/${tournamentId}`;
  const tvUrl = `${window.location.origin}/tv/${tournamentId}`;
  const tvShortUrl = tournament.shortCode ? `${window.location.origin}/t/${tournament.shortCode}` : '';

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

  return (
    <Container>
      <div className="py-6 max-w-2xl mx-auto space-y-4">
        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-text-primary">{tournament.title}</h1>
              {tournament.location && <p className="text-xs text-text-muted mt-0.5">{tournament.location}</p>}
            </div>
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

        <TournamentBracketSection
          id={tournamentId!}
          bracket={tournament.bracket}
          isStaff={isOwner}
          onUpdateBracket={bracket => updateStandaloneTournamentBracket(tournamentId!, bracket)}
        />

        <div className="flex items-center justify-between gap-2">
          <Link to="/tools/tournaments" className="inline-flex items-center gap-1.5 text-xs text-app-cyan hover:text-app-cyan/80 transition-colors">
            ← {t('tools.title')}
          </Link>
          {isOwner && (
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
