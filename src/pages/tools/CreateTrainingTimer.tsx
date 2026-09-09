/**
 * Create Training Timer — mode + interval configuration, then straight into
 * the live view (TrainingTimerView) which any club staff member can join.
 */

import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { createTrainingTimer } from '../../services/firebase/trainingTimers';
import type { TrainingTimerMode } from '../../types';

const STAFF_ROLES = ['clubOwner', 'trainer', 'assistant', 'admin'];

export default function CreateTrainingTimer() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clubId = searchParams.get('clubId') || '';

  const isStaff = !!user && (STAFF_ROLES.includes(user.role) || user.isSuperAdmin);

  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<TrainingTimerMode>('intervals');
  const [sets, setSets] = useState(4);
  const [workMinutes, setWorkMinutes] = useState(13);
  const [breakMinutes, setBreakMinutes] = useState(1);
  const [warningMinutesBefore, setWarningMinutesBefore] = useState(2);
  const [creating, setCreating] = useState(false);

  // Lets each number field go visually blank while being retyped instead of
  // snapping to a digit mid-edit (e.g. clearing "13" to type "2") — the
  // underlying value only updates once a new digit is typed, and reverts to
  // whatever it was before if left blank on blur.
  const [setsBlank, setSetsBlank] = useState(false);
  const [workMinutesBlank, setWorkMinutesBlank] = useState(false);
  const [breakMinutesBlank, setBreakMinutesBlank] = useState(false);
  const [warningBlank, setWarningBlank] = useState(false);

  if (!isStaff || !clubId) {
    return (
      <Container>
        <div className="py-16 text-center">
          <h1 className="text-lg font-bold text-text-primary mb-2">{t('tools.noAccess')}</h1>
          <Link to="/tools/training-timer" className="text-app-cyan hover:text-app-cyan/80">{t('trainingTimer.title')}</Link>
        </div>
      </Container>
    );
  }

  const handleCreate = async () => {
    if (!user) return;
    setCreating(true);
    try {
      const id = await createTrainingTimer({
        clubId,
        createdBy: user.id,
        createdByName: user.displayName,
        title: title.trim() || undefined,
        mode,
        sets: Math.max(1, sets),
        workMinutes: Math.max(1, workMinutes),
        breakMinutes,
        warningMinutesBefore,
      });
      navigate(`/tools/training-timer/${id}`);
    } catch (err) {
      console.error('CreateTrainingTimer: create failed', err);
      alert(t('trainingTimer.createError'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Container>
      <div className="py-6 max-w-md mx-auto space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold text-text-primary">{t('trainingTimer.create')}</h1>
          <Link to="/tools/training-timer" className="text-xs text-app-cyan hover:text-app-cyan/80">← {t('trainingTimer.title')}</Link>
        </div>

        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 space-y-4">
          <div>
            <label className="text-[10px] text-text-muted">{t('trainingTimer.titleLabel')}</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t('trainingTimer.titlePlaceholder')}
              className="w-full mt-0.5 px-2.5 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary"
            />
          </div>

          <div>
            <label className="text-[10px] text-text-muted">{t('trainingTimer.modeLabel')}</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                onClick={() => setMode('intervals')}
                className={`px-3 py-2.5 text-xs font-semibold rounded-xl border transition-colors ${
                  mode === 'intervals' ? 'bg-app-cyan/10 border-app-cyan text-app-cyan' : 'bg-app-secondary border-white/10 text-text-secondary hover:border-white/30'
                }`}
              >
                ⏱ {t('trainingTimer.intervals')}
              </button>
              <button
                onClick={() => setMode('stopwatch')}
                className={`px-3 py-2.5 text-xs font-semibold rounded-xl border transition-colors ${
                  mode === 'stopwatch' ? 'bg-app-cyan/10 border-app-cyan text-app-cyan' : 'bg-app-secondary border-white/10 text-text-secondary hover:border-white/30'
                }`}
              >
                ⏲ {t('trainingTimer.stopwatch')}
              </button>
            </div>
          </div>

          {mode === 'intervals' && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-text-muted">{t('trainingTimer.setsLabel')}</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={setsBlank ? '' : sets}
                    onChange={e => {
                      const raw = e.target.value;
                      if (raw === '') { setSetsBlank(true); return; }
                      setSetsBlank(false);
                      setSets(Math.max(1, Math.min(20, Number(raw) || 1)));
                    }}
                    onBlur={() => setSetsBlank(false)}
                    className="w-full mt-0.5 px-2 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-text-muted">{t('trainingTimer.workMinutesLabel')}</label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={workMinutesBlank ? '' : workMinutes}
                    onChange={e => {
                      const raw = e.target.value;
                      if (raw === '') { setWorkMinutesBlank(true); return; }
                      setWorkMinutesBlank(false);
                      setWorkMinutes(Math.max(1, Math.min(120, Number(raw) || 1)));
                    }}
                    onBlur={() => setWorkMinutesBlank(false)}
                    className="w-full mt-0.5 px-2 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-text-muted">{t('trainingTimer.breakMinutesLabel')}</label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={breakMinutesBlank ? '' : breakMinutes}
                    onChange={e => {
                      const raw = e.target.value;
                      if (raw === '') { setBreakMinutesBlank(true); return; }
                      setBreakMinutesBlank(false);
                      setBreakMinutes(Math.max(0, Math.min(60, Number(raw) || 0)));
                    }}
                    onBlur={() => setBreakMinutesBlank(false)}
                    className="w-full mt-0.5 px-2 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-text-muted">{t('trainingTimer.warningMinutesLabel')}</label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={warningBlank ? '' : warningMinutesBefore}
                  onChange={e => {
                    const raw = e.target.value;
                    if (raw === '') { setWarningBlank(true); return; }
                    setWarningBlank(false);
                    setWarningMinutesBefore(Math.max(0, Math.min(10, Number(raw) || 0)));
                  }}
                  onBlur={() => setWarningBlank(false)}
                  className="w-full mt-0.5 px-2.5 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                />
                <p className="text-[9px] text-text-muted mt-1">{t('trainingTimer.warningMinutesHint')}</p>
              </div>

              <p className="text-[10px] text-text-muted">
                {t('trainingTimer.summary', { sets, workMinutes, breakMinutes })}
              </p>
            </>
          )}

          <button
            onClick={handleCreate}
            disabled={creating}
            className="w-full px-4 py-2.5 bg-gradient-primary rounded-xl text-sm font-semibold text-white shadow-button hover:shadow-button-hover transition-all disabled:opacity-50"
          >
            {creating ? t('common.saving') : t('trainingTimer.startSession')}
          </button>
        </div>
      </div>
    </Container>
  );
}
