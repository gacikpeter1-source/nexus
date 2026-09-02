/**
 * Create Nomination Page
 * Trainer/assistant picks a primary roster + ordered backlog for an
 * upcoming game or tournament and sets a response deadline.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { getNominationCandidates, createNomination, createManualCandidate, type NominationCandidate } from '../../services/firebase/nominations';
import type { NominationGame, NominationKind } from '../../types';

type Assignment = 'none' | 'primary' | 'backlog';

function newGame(): NominationGame {
  return { id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, date: '', startTime: '', location: '', opponent: '' };
}

export default function CreateNomination() {
  const { clubId, teamId } = useParams<{ clubId: string; teamId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<NominationKind>(searchParams.get('kind') === 'tournament' ? 'tournament' : 'single');
  const [games, setGames] = useState<NominationGame[]>([newGame()]);
  const [collapsedGameIds, setCollapsedGameIds] = useState<Set<string>>(new Set());
  const [deadline, setDeadline] = useState('');
  const [primarySize, setPrimarySize] = useState(13);

  const [candidates, setCandidates] = useState<NominationCandidate[]>([]);
  const [manualCandidates, setManualCandidates] = useState<NominationCandidate[]>([]);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [manualName, setManualName] = useState('');
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({});
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (clubId && teamId) loadCandidates();
  }, [clubId, teamId]);

  const loadCandidates = async () => {
    setCandidatesLoading(true);
    try {
      setCandidates(await getNominationCandidates(clubId!, teamId!));
    } catch (err) {
      console.error('CreateNomination: error loading candidates', err);
    } finally {
      setCandidatesLoading(false);
    }
  };

  const setAssignment = (athleteId: string, value: Assignment) => {
    setAssignments(prev => ({ ...prev, [athleteId]: value }));
  };

  const updateGame = (id: string, patch: Partial<NominationGame>) => {
    setGames(prev => prev.map(g => (g.id === id ? { ...g, ...patch } : g)));
  };

  const addGame = () => setGames(prev => [...prev, newGame()]);
  const removeGame = (id: string) => setGames(prev => prev.filter(g => g.id !== id));
  const toggleGameCollapsed = (id: string) => {
    setCollapsedGameIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allCandidates = [...candidates, ...manualCandidates];
  const visibleCandidates = candidateSearch.trim()
    ? allCandidates.filter(c => c.displayName.toLowerCase().includes(candidateSearch.trim().toLowerCase()))
    : allCandidates;
  const primaryList = allCandidates.filter(c => assignments[c.athleteId] === 'primary');
  const backlogList = allCandidates.filter(c => assignments[c.athleteId] === 'backlog');

  const handleAddManual = () => {
    if (!manualName.trim()) return;
    const candidate = createManualCandidate(manualName);
    setManualCandidates(prev => [...prev, candidate]);
    setManualName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) { setError(t('nominations.errors.titleRequired')); return; }
    if (!deadline) { setError(t('nominations.errors.deadlineRequired')); return; }
    if (primaryList.length === 0) { setError(t('nominations.errors.primaryRequired')); return; }

    // Game details are optional — drop rows the trainer left completely blank
    const filledGames = games.filter(g => g.date || g.startTime || g.opponent || g.location);

    setSubmitting(true);
    try {
      const id = await createNomination({
        clubId: clubId!,
        teamId: teamId!,
        createdBy: user!.id,
        title: title.trim(),
        kind,
        games: filledGames,
        deadline: new Date(deadline),
        primarySize,
        primaryCandidates: primaryList,
        backlogCandidates: backlogList,
      });
      navigate(`/clubs/${clubId}/nominations/${id}`);
    } catch (err) {
      console.error('CreateNomination: submit error', err);
      setError(t('nominations.errors.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container>
      <div className="py-6 max-w-2xl mx-auto space-y-4">
        <h1 className="text-xl font-bold text-text-primary">{t('nominations.createTitle')}</h1>

        <form onSubmit={handleSubmit} className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-6 space-y-5">
          {error && (
            <div className="bg-chart-pink/10 border border-chart-pink/30 rounded-xl p-3 text-chart-pink text-sm">{error}</div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-text-primary mb-1.5">{t('nominations.title')} <span className="text-chart-pink">*</span></label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t('nominations.titlePlaceholder')}
              className="w-full px-3 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
            />
          </div>

          {/* Kind */}
          <div>
            <label className="block text-sm font-semibold text-text-primary mb-1.5">{t('nominations.kind')}</label>
            <div className="flex gap-2">
              {(['single', 'tournament'] as const).map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => { setKind(k); if (k === 'single') setGames(prev => prev.slice(0, 1)); }}
                  className={`flex-1 px-3 py-2 text-sm rounded-xl border transition-all ${
                    kind === k ? 'bg-app-blue text-white border-app-blue' : 'bg-app-secondary text-text-secondary border-white/10 hover:bg-white/5'
                  }`}
                >
                  {t(`nominations.kinds.${k}`)}
                </button>
              ))}
            </div>
            {kind === 'tournament' && (
              <p className="mt-1.5 text-xs text-text-muted">{t('nominations.tournamentHint')}</p>
            )}
          </div>

          {/* Games */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-text-primary">
              {t('nominations.games')} <span className="text-text-muted font-normal">{t('common.optional')}</span>
            </label>
            {games.map((g, i) => {
              const isCollapsible = kind === 'tournament';
              const isCollapsed = isCollapsible && collapsedGameIds.has(g.id);
              const summary = [
                g.date ? new Date(g.date + 'T00:00:00').toLocaleDateString() : '',
                g.startTime,
                g.opponent,
              ].filter(Boolean).join(' · ');

              return (
                <div key={g.id} className="p-3 bg-app-secondary rounded-xl border border-white/10 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => isCollapsible && toggleGameCollapsed(g.id)}
                      disabled={!isCollapsible}
                      className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
                    >
                      {isCollapsible && (
                        <svg
                          className={`w-3.5 h-3.5 flex-shrink-0 text-text-muted transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                      <span className="text-xs font-semibold text-text-secondary flex-shrink-0">
                        {kind === 'tournament' ? `${t('nominations.game')} ${i + 1}` : t('nominations.game')}
                      </span>
                      {isCollapsed && summary && (
                        <span className="text-xs text-text-muted truncate">— {summary}</span>
                      )}
                    </button>
                    {kind === 'tournament' && games.length > 1 && (
                      <button type="button" onClick={() => removeGame(g.id)} className="flex-shrink-0 text-[10px] text-chart-pink hover:text-chart-pink/80">
                        {t('common.remove')}
                      </button>
                    )}
                  </div>
                  {!isCollapsed && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={g.date}
                        onChange={e => updateGame(g.id, { date: e.target.value })}
                        className="w-full min-w-0 px-2.5 py-2 text-sm bg-app-card border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
                      />
                      <input
                        type="time"
                        value={g.startTime}
                        onChange={e => updateGame(g.id, { startTime: e.target.value })}
                        className="w-full min-w-0 px-2.5 py-2 text-sm bg-app-card border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
                      />
                      <input
                        type="text"
                        value={g.opponent}
                        onChange={e => updateGame(g.id, { opponent: e.target.value })}
                        placeholder={t('nominations.opponentPlaceholder')}
                        className="w-full min-w-0 px-2.5 py-2 text-sm bg-app-card border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
                      />
                      <input
                        type="text"
                        value={g.location}
                        onChange={e => updateGame(g.id, { location: e.target.value })}
                        placeholder={t('nominations.locationPlaceholder')}
                        className="w-full min-w-0 px-2.5 py-2 text-sm bg-app-card border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
                      />
                    </div>
                  )}
                </div>
              );
            })}
            {kind === 'tournament' && (
              <button type="button" onClick={addGame} className="text-xs font-semibold text-app-cyan hover:text-app-cyan/80">
                + {t('nominations.addGame')}
              </button>
            )}
          </div>

          {/* Deadline & primary size */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-text-primary mb-1.5">{t('nominations.deadline')} <span className="text-chart-pink">*</span></label>
              <input
                type="datetime-local"
                value={deadline}
                onChange={e => setDeadline(e.target.value)}
                className="w-full px-2.5 py-2 text-sm bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-text-primary mb-1.5">{t('nominations.primarySize')}</label>
              <input
                type="number"
                min={1}
                value={primarySize}
                onChange={e => setPrimarySize(Math.max(1, Number(e.target.value) || 1))}
                className="w-full px-2.5 py-2 text-sm bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
              />
            </div>
          </div>

          {/* Roster picker */}
          <div>
            <label className="block text-sm font-semibold text-text-primary mb-1.5">
              {t('nominations.roster')} <span className="text-chart-pink">*</span>
            </label>
            <p className="text-xs text-text-muted mb-2">
              {t('nominations.rosterHint')} — {primaryList.length} {t('nominations.primaryLabel').toLowerCase()}, {backlogList.length} {t('nominations.backlogLabel').toLowerCase()}
            </p>

            {/* Search */}
            <input
              type="text"
              value={candidateSearch}
              onChange={e => setCandidateSearch(e.target.value)}
              placeholder={t('nominations.searchPlaceholder')}
              className="w-full mb-2 px-3 py-2 text-sm bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
            />

            {/* Manual (unregistered) entry */}
            <div className="flex gap-1.5 mb-3">
              <input
                type="text"
                value={manualName}
                onChange={e => setManualName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddManual(); } }}
                placeholder={t('nominations.manualNamePlaceholder')}
                className="flex-1 px-3 py-2 text-sm bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
              />
              <button
                type="button"
                onClick={handleAddManual}
                disabled={!manualName.trim()}
                className="px-3 py-2 text-xs font-semibold bg-app-secondary border border-white/10 text-app-cyan rounded-xl hover:bg-white/10 disabled:opacity-40 transition-colors"
              >
                {t('nominations.addManual')}
              </button>
            </div>

            {candidatesLoading ? (
              <div className="flex items-center gap-2 py-3">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-app-cyan" />
                <span className="text-sm text-text-muted">{t('common.loading')}</span>
              </div>
            ) : visibleCandidates.length === 0 ? (
              <p className="text-sm text-text-muted py-2">{t('nominations.noCandidates')}</p>
            ) : (
              <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                {visibleCandidates.map(c => {
                  const value = assignments[c.athleteId] || 'none';
                  return (
                    <div key={c.athleteId} className="flex items-center gap-2 p-2 bg-app-secondary rounded-lg border border-white/10">
                      <span className="flex-1 text-sm text-text-primary truncate">
                        {c.displayName}
                        {c.isManual && <span className="ml-1.5 text-[9px] font-semibold text-text-muted align-middle">({t('nominations.manual')})</span>}
                      </span>
                      <div className="flex gap-1 flex-shrink-0">
                        {(['primary', 'backlog', 'none'] as const).map(opt => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setAssignment(c.athleteId, opt)}
                            className={`px-2 py-1 text-[10px] font-medium rounded-lg transition-all ${
                              value === opt
                                ? opt === 'primary' ? 'bg-chart-cyan text-white'
                                  : opt === 'backlog' ? 'bg-chart-purple text-white'
                                  : 'bg-white/10 text-text-secondary'
                                : 'bg-app-card text-text-muted hover:bg-white/5'
                            }`}
                          >
                            {opt === 'none' ? '—' : t(`nominations.${opt}Label`)}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => navigate(`/clubs/${clubId}/teams/${teamId}?tab=nominations`)}
              className="flex-1 px-4 py-2.5 bg-app-secondary text-text-primary border border-white/10 rounded-xl hover:bg-white/10 transition-all font-semibold"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2.5 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover disabled:opacity-50 transition-all font-semibold"
            >
              {submitting ? t('common.loading') : t('nominations.create')}
            </button>
          </div>
        </form>
      </div>
    </Container>
  );
}
