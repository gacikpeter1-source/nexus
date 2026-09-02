/**
 * Tournament Results Page
 * Read-focused view of a tournament-kind nomination: who played (confirmed
 * roster) and each game's score. Viewable by any club member; only staff can
 * enter/edit scores, and only for tournament-kind nominations — Firestore
 * rules keep single-game nominations exactly as private as before.
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { subscribeToNomination, updateNominationGameScore, updateNominationBracket } from '../../services/firebase/nominations';
import TournamentBracketSection from '../../components/team/TournamentBracketSection';
import TournamentSetupWizard from '../../components/team/TournamentSetupWizard';
import GameStatsModal from '../../components/team/GameStatsModal';
import type { Nomination, NominationGame } from '../../types';

export default function TournamentDetail() {
  const { clubId, nominationId } = useParams<{ clubId: string; nominationId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();

  const [nomination, setNomination] = useState<Nomination | null>(null);
  const [loading, setLoading] = useState(true);
  const [isStaff, setIsStaff] = useState(false);

  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [teamScoreInput, setTeamScoreInput] = useState('');
  const [opponentScoreInput, setOpponentScoreInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [statsGameId, setStatsGameId] = useState<string | null>(null);
  const [creatingBracket, setCreatingBracket] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    if (!clubId || !nominationId) return;
    const unsub = subscribeToNomination(clubId, nominationId, n => {
      setNomination(n);
      setLoading(false);
    });
    return unsub;
  }, [clubId, nominationId]);

  useEffect(() => {
    if (!clubId || !user) return;
    (async () => {
      const clubSnap = await getDoc(doc(db, 'clubs', clubId));
      if (!clubSnap.exists()) return;
      const club = clubSnap.data();
      setIsStaff(
        club.ownerId === user.id ||
        (club.trainers || []).includes(user.id) ||
        (club.assistants || []).includes(user.id) ||
        user.role === 'admin'
      );
    })();
  }, [clubId, user]);

  if (loading) {
    return (
      <Container>
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-cyan" />
        </div>
      </Container>
    );
  }

  if (!nomination) {
    return (
      <Container>
        <div className="py-16 text-center">
          <h1 className="text-lg font-bold text-text-primary mb-2">{t('nominations.notFound')}</h1>
          <Link to="/calendar" className="text-app-cyan hover:text-app-cyan/80">{t('events.detail.backToCalendar')}</Link>
        </div>
      </Container>
    );
  }

  const confirmedPlayers = Object.values(nomination.primary)
    .filter(e => e.status === 'confirmed')
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const games = [...nomination.games].sort((a, b) => a.date.localeCompare(b.date));

  const startEditScore = (game: NominationGame) => {
    setEditingGameId(game.id);
    setTeamScoreInput(game.teamScore !== undefined ? String(game.teamScore) : '');
    setOpponentScoreInput(game.opponentScore !== undefined ? String(game.opponentScore) : '');
  };

  const saveScore = async (gameId: string) => {
    const teamScore = Number(teamScoreInput);
    const opponentScore = Number(opponentScoreInput);
    if (teamScoreInput === '' || opponentScoreInput === '' || Number.isNaN(teamScore) || Number.isNaN(opponentScore)) return;
    setSaving(true);
    try {
      await updateNominationGameScore(clubId!, nominationId!, gameId, teamScore, opponentScore);
      setEditingGameId(null);
    } catch (err) {
      console.error('TournamentDetail: save score failed', err);
      alert(t('nominations.errors.scoreSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const gameLabel = (g: NominationGame) => {
    const parts = [new Date(g.date + 'T00:00:00').toLocaleDateString()];
    if (g.startTime) parts.push(g.startTime);
    return parts.join(' · ');
  };

  const handleCreateBracket = async () => {
    setCreatingBracket(true);
    try {
      await updateNominationBracket(clubId!, nominationId!, { groups: [], matches: [] });
    } catch (err) {
      console.error('TournamentDetail: create bracket failed', err);
      alert(t('nominations.errors.bracketSaveFailed'));
    } finally {
      setCreatingBracket(false);
    }
  };

  return (
    <Container>
      <div className="py-6 max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-text-primary">{nomination.title}</h1>
              <p className="text-xs text-text-muted mt-0.5">
                {games.length} {t('nominations.gamesLabel')} · {confirmedPlayers.length} {t('nominations.playedLabel')}
              </p>
            </div>
            {nomination.bracket && (
              <a
                href={`/tv/${nominationId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold bg-app-secondary border border-white/10 text-app-cyan rounded-lg hover:border-app-cyan transition-colors"
              >
                {t('nominations.bracket.openTv')}
              </a>
            )}
          </div>
        </div>

        {/* Bracket — group standings + full match schedule */}
        {nomination.bracket ? (
          <TournamentBracketSection
            clubId={clubId!}
            nominationId={nominationId!}
            bracket={nomination.bracket}
            isStaff={isStaff}
            favoriteTeamName={nomination.favoriteTeamName}
          />
        ) : isStaff && (
          <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 text-center space-y-2">
            <p className="text-xs text-text-secondary">{t('nominations.bracket.noneYet')}</p>
            <button
              onClick={() => setShowWizard(true)}
              className="px-4 py-2 text-xs font-semibold bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover transition-all"
            >
              {t('nominations.bracket.wizard.openButton')}
            </button>
            <div>
              <button
                onClick={handleCreateBracket}
                disabled={creatingBracket}
                className="text-[10px] text-text-muted hover:text-app-cyan transition-colors disabled:opacity-50"
              >
                {creatingBracket ? t('common.saving') : t('nominations.bracket.create')}
              </button>
            </div>
          </div>
        )}

        {showWizard && (
          <TournamentSetupWizard
            clubId={clubId!}
            nominationId={nominationId!}
            onClose={() => setShowWizard(false)}
          />
        )}

        {/* Games + scores */}
        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 space-y-2">
          <h2 className="text-sm font-bold text-text-primary">{t('nominations.gamesLabel')}</h2>
          {games.length === 0 ? (
            <p className="text-xs text-text-muted py-1">{t('nominations.noGames')}</p>
          ) : (
            <div className="space-y-1.5">
              {games.map(game => (
                <div key={game.id} className="p-2.5 bg-app-secondary rounded-lg border border-white/10">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-text-primary truncate">
                        {game.opponent || t('nominations.opponentTbd')}
                      </div>
                      <div className="text-[10px] text-text-muted">
                        {gameLabel(game)}{game.location ? ` · ${game.location}` : ''}
                      </div>
                    </div>

                    {editingGameId === game.id ? (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <input
                          type="number"
                          value={teamScoreInput}
                          onChange={e => setTeamScoreInput(e.target.value)}
                          className="w-12 px-1.5 py-1 text-xs text-center bg-app-card border border-white/10 rounded text-text-primary"
                        />
                        <span className="text-text-muted text-xs">:</span>
                        <input
                          type="number"
                          value={opponentScoreInput}
                          onChange={e => setOpponentScoreInput(e.target.value)}
                          className="w-12 px-1.5 py-1 text-xs text-center bg-app-card border border-white/10 rounded text-text-primary"
                        />
                        <button
                          onClick={() => saveScore(game.id)}
                          disabled={saving}
                          className="px-2 py-1 text-[10px] font-semibold bg-gradient-primary text-white rounded disabled:opacity-50"
                        >
                          {t('common.save')}
                        </button>
                        <button
                          onClick={() => setEditingGameId(null)}
                          className="px-2 py-1 text-[10px] bg-app-card border border-white/10 text-text-muted rounded"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {game.teamScore !== undefined && game.opponentScore !== undefined ? (
                          <span className="text-sm font-bold text-text-primary">
                            {game.teamScore} : {game.opponentScore}
                          </span>
                        ) : (
                          <span className="text-[10px] text-text-muted">{t('nominations.noScoreYet')}</span>
                        )}
                        {isStaff && (
                          <button
                            onClick={() => startEditScore(game)}
                            className="text-[10px] font-semibold text-app-cyan hover:text-app-cyan/80"
                          >
                            {t('common.edit')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {isStaff && (
                    <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-white/5">
                      <span className="text-[10px] text-text-muted">
                        {(game.goalEvents?.length || 0) > 0 || (game.penaltyEvents?.length || 0) > 0 || (game.goalieStats?.length || 0) > 0
                          ? `⚽ ${game.goalEvents?.length || 0} · 🟨 ${game.penaltyEvents?.length || 0} · 🥅 ${game.goalieStats?.length || 0}`
                          : t('gameStats.noStatsYet')}
                      </span>
                      <button
                        onClick={() => setStatsGameId(game.id)}
                        className="px-2.5 py-1 text-[10px] font-semibold bg-app-card border border-white/10 text-app-cyan rounded-lg hover:border-app-cyan transition-colors"
                      >
                        {t('gameStats.takeStats')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Who played */}
        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 space-y-2">
          <h2 className="text-sm font-bold text-text-primary">{t('nominations.whoPlayed')} ({confirmedPlayers.length})</h2>
          {confirmedPlayers.length === 0 ? (
            <p className="text-xs text-text-muted py-1">{t('nominations.noPrimary')}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {confirmedPlayers.map(p => (
                <span key={p.athleteId} className="px-2.5 py-1 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary">
                  {p.displayName}
                </span>
              ))}
            </div>
          )}
        </div>

        <Link
          to={`/clubs/${clubId}/teams/${nomination.teamId}?tab=tournaments`}
          className="inline-flex items-center gap-1.5 text-xs text-app-cyan hover:text-app-cyan/80 transition-colors"
        >
          ← {t('nominations.backToTournaments')}
        </Link>
      </div>

      {statsGameId && (() => {
        const liveGame = nomination.games.find(g => g.id === statsGameId);
        return liveGame ? (
          <GameStatsModal
            clubId={clubId!}
            nominationId={nominationId!}
            game={liveGame}
            roster={confirmedPlayers}
            onClose={() => setStatsGameId(null)}
          />
        ) : null;
      })()}
    </Container>
  );
}
