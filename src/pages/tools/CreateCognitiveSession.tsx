/**
 * Create Cognitive Training session — pick a game + configure task/break
 * durations, then straight into the live control view
 * (CognitiveSessionControl).
 */

import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { createCognitiveSession } from '../../services/firebase/cognitiveSessions';
import { listCognitiveGames } from '../../cognitiveTraining/registry';

const STAFF_ROLES = ['clubOwner', 'trainer', 'assistant', 'admin'];
const games = listCognitiveGames();

export default function CreateCognitiveSession() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clubId = searchParams.get('clubId') || '';
  const teamId = searchParams.get('teamId') || '';

  const isStaff = !!user && (STAFF_ROLES.includes(user.role) || user.isSuperAdmin);

  const [gameId, setGameId] = useState(games[0]?.id || '');
  const [gameConfig, setGameConfig] = useState<Record<string, unknown>>(games[0]?.defaultConfig || {});
  const [taskDurationSec, setTaskDurationSec] = useState(30);
  const [breakDurationSec, setBreakDurationSec] = useState(10);
  const [taskCount, setTaskCount] = useState(10);
  const [countdownSec, setCountdownSec] = useState(3);
  const [creating, setCreating] = useState(false);

  const selectedGame = games.find(g => g.id === gameId);

  if (!isStaff || !clubId || !teamId) {
    return (
      <Container>
        <div className="py-16 text-center">
          <h1 className="text-lg font-bold text-text-primary mb-2">{t('tools.noAccess')}</h1>
          <Link to="/tools/cognitive-training" className="text-app-cyan hover:text-app-cyan/80">{t('cognitiveTraining.title')}</Link>
        </div>
      </Container>
    );
  }

  const handleGameChange = (id: string) => {
    setGameId(id);
    const game = games.find(g => g.id === id);
    setGameConfig(game?.defaultConfig || {});
  };

  const handleCreate = async () => {
    if (!user || !selectedGame) return;
    setCreating(true);
    try {
      const id = await createCognitiveSession({
        clubId,
        teamId,
        createdBy: user.id,
        createdByName: user.displayName,
        gameId: selectedGame.id,
        gameConfig,
        taskDurationSec: Math.max(1, taskDurationSec),
        breakDurationSec: Math.max(0, breakDurationSec),
        taskCount: Math.max(1, taskCount),
        countdownSec: Math.max(0, countdownSec),
      });
      navigate(`/tools/cognitive-training/${id}`);
    } catch (err) {
      console.error('CreateCognitiveSession: create failed', err);
      alert(t('cognitiveTraining.createError'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Container>
      <div className="py-6 max-w-md mx-auto space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold text-text-primary">{t('cognitiveTraining.create')}</h1>
          <Link to="/tools/cognitive-training" className="text-xs text-app-cyan hover:text-app-cyan/80">← {t('cognitiveTraining.title')}</Link>
        </div>

        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 space-y-4">
          <div>
            <label className="text-[10px] text-text-muted">{t('cognitiveTraining.gameLabel')}</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {games.map(g => (
                <button
                  key={g.id}
                  onClick={() => handleGameChange(g.id)}
                  className={`px-3 py-2.5 text-xs font-semibold rounded-xl border transition-colors ${
                    gameId === g.id ? 'bg-app-cyan/10 border-app-cyan text-app-cyan' : 'bg-app-secondary border-white/10 text-text-secondary hover:border-white/30'
                  }`}
                >
                  {t(g.nameKey)}
                </button>
              ))}
            </div>
          </div>

          {selectedGame && (
            <div>
              <label className="text-[10px] text-text-muted">{t('cognitiveTraining.gameConfigLabel')}</label>
              <div className="mt-1">
                <selectedGame.ConfigEditor value={gameConfig} onChange={setGameConfig} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-text-muted">{t('cognitiveTraining.taskDurationLabel')}</label>
              <input
                type="number"
                min={1}
                max={300}
                value={taskDurationSec}
                onChange={e => setTaskDurationSec(Math.max(1, Math.min(300, Number(e.target.value) || 1)))}
                className="w-full mt-0.5 px-2.5 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-muted">{t('cognitiveTraining.breakDurationLabel')}</label>
              <input
                type="number"
                min={0}
                max={120}
                value={breakDurationSec}
                onChange={e => setBreakDurationSec(Math.max(0, Math.min(120, Number(e.target.value) || 0)))}
                className="w-full mt-0.5 px-2.5 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-muted">{t('cognitiveTraining.taskCountLabel')}</label>
              <input
                type="number"
                min={1}
                max={200}
                value={taskCount}
                onChange={e => setTaskCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                className="w-full mt-0.5 px-2.5 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-muted">{t('cognitiveTraining.countdownLabel')}</label>
              <input
                type="number"
                min={0}
                max={10}
                value={countdownSec}
                onChange={e => setCountdownSec(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
                className="w-full mt-0.5 px-2.5 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary"
              />
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={creating || !selectedGame}
            className="w-full px-4 py-2.5 bg-gradient-primary rounded-xl text-sm font-semibold text-white shadow-button hover:shadow-button-hover transition-all disabled:opacity-50"
          >
            {creating ? t('common.saving') : t('cognitiveTraining.createButton')}
          </button>
        </div>
      </div>
    </Container>
  );
}
