/**
 * Guided, step-by-step tournament setup: number of groups → teams per group
 * → optional auto-generated playoffs (2-group cross-seeding only) → optional
 * sequential schedule → review & create. Builds the full TournamentBracket
 * client-side with utils/tournamentBracket.ts helpers and writes it once at
 * the end — an alternative on-ramp to the existing manual Add Group/Add
 * Match/Excel-import controls in TournamentBracketSection, not a replacement
 * for them (everything it creates stays editable there afterward).
 */

import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { updateNominationBracket } from '../../services/firebase/nominations';
import {
  buildGroupStageBracket,
  appendCrossSeededPlayoffs,
  applySequentialSchedule,
  roundRobinPairs,
  type WizardAdvanceCount,
} from '../../utils/tournamentBracket';

interface Props {
  clubId: string;
  nominationId: string;
  onClose: () => void;
}

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const TOTAL_STEPS = 4;

export default function TournamentSetupWizard({ clubId, nominationId, onClose }: Props) {
  const { t } = useLanguage();

  const [step, setStep] = useState(1);
  const [groupCount, setGroupCount] = useState(2);
  const [groupTeams, setGroupTeams] = useState<string[][]>([[], []]);
  const [teamInputs, setTeamInputs] = useState<string[]>(['', '']);
  const [playoffEnabled, setPlayoffEnabled] = useState(true);
  const [advanceCount, setAdvanceCount] = useState<WizardAdvanceCount>(2);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [firstStartTime, setFirstStartTime] = useState('09:00');
  const [minutesPerGame, setMinutesPerGame] = useState(60);
  const [saving, setSaving] = useState(false);

  const twoGroups = groupCount === 2;
  const playoffStepShown = twoGroups;
  // Steps are numbered 1..4 logically (groups, teams, playoffs, schedule+review
  // combined) but playoffs only exists for exactly 2 groups, so it's skipped
  // transparently when navigating.
  const lastStep = TOTAL_STEPS;

  const setGroupCountClamped = (n: number) => {
    const clamped = Math.max(1, Math.min(6, n));
    setGroupCount(clamped);
    setGroupTeams(prev => {
      const next = [...prev];
      while (next.length < clamped) next.push([]);
      return next.slice(0, clamped);
    });
    setTeamInputs(prev => {
      const next = [...prev];
      while (next.length < clamped) next.push('');
      return next.slice(0, clamped);
    });
    if (clamped !== 2 && playoffEnabled) setPlayoffEnabled(false);
    if (clamped === 2) setPlayoffEnabled(true);
  };

  const addTeam = (groupIdx: number) => {
    const name = teamInputs[groupIdx].trim();
    if (!name) return;
    setGroupTeams(prev => prev.map((teams, i) => (i === groupIdx ? [...teams, name] : teams)));
    setTeamInputs(prev => prev.map((v, i) => (i === groupIdx ? '' : v)));
  };

  const removeTeam = (groupIdx: number, teamIdx: number) => {
    setGroupTeams(prev => prev.map((teams, i) => (i === groupIdx ? teams.filter((_, ti) => ti !== teamIdx) : teams)));
  };

  const allGroupsHaveEnoughTeams = groupTeams.every(teams => teams.length >= 2);

  const goNext = () => {
    if (step === 2 && !playoffStepShown) {
      setStep(4); // skip the playoffs step entirely for group counts other than 2
    } else {
      setStep(s => Math.min(lastStep, s + 1));
    }
  };

  const goBack = () => {
    if (step === 4 && !playoffStepShown) {
      setStep(2);
    } else {
      setStep(s => Math.max(1, s - 1));
    }
  };

  const groupStageMatchCount = groupTeams.reduce((sum, teams) => sum + roundRobinPairs(teams).length, 0);
  const playoffMatchCount = !playoffStepShown || !playoffEnabled
    ? 0
    : advanceCount === 1 ? 1
    : advanceCount === 2 ? 4
    : advanceCount === 3 ? 5
    : 6;

  const handleCreate = async () => {
    setSaving(true);
    try {
      let bracket = buildGroupStageBracket(
        groupTeams.map((teams, i) => ({ name: GROUP_LETTERS[i] || `${i + 1}`, teamNames: teams }))
      );
      if (playoffStepShown && playoffEnabled) {
        bracket = appendCrossSeededPlayoffs(bracket, advanceCount, {
          semifinal1: t('nominations.bracket.wizard.labelSemifinal1'),
          semifinal2: t('nominations.bracket.wizard.labelSemifinal2'),
          thirdPlace: t('nominations.bracket.wizard.labelThirdPlace'),
          final: t('nominations.bracket.wizard.labelFinal'),
          place5to6: t('nominations.bracket.wizard.labelPlace5to6'),
          place7to8: t('nominations.bracket.wizard.labelPlace7to8'),
        });
      }
      if (scheduleEnabled) {
        bracket = applySequentialSchedule(bracket, { firstStartTime, minutesPerGame });
      }
      await updateNominationBracket(clubId, nominationId, bracket);
      onClose();
    } catch (err) {
      console.error('TournamentSetupWizard: create failed', err);
      alert(t('nominations.errors.bracketSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-app-card w-full max-w-md rounded-2xl border border-white/10 shadow-2xl p-5 max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base font-bold text-text-primary">{t('nominations.bracket.wizard.title')}</h2>
            <button onClick={onClose} className="text-text-muted hover:text-text-primary text-lg leading-none">×</button>
          </div>
          <p className="text-[10px] text-text-muted mb-4">
            {t('nominations.bracket.wizard.stepIndicator', { step, total: lastStep })}
          </p>

          {step === 1 && (
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">{t('nominations.bracket.wizard.groupsTitle')}</h3>
                <p className="text-xs text-text-secondary mt-0.5">{t('nominations.bracket.wizard.groupsDescription')}</p>
              </div>
              <div className="flex items-center justify-center gap-4 py-3">
                <button
                  onClick={() => setGroupCountClamped(groupCount - 1)}
                  disabled={groupCount <= 1}
                  className="w-10 h-10 rounded-xl bg-app-secondary border border-white/10 text-text-primary text-lg font-bold disabled:opacity-30"
                >
                  −
                </button>
                <span className="text-2xl font-bold text-text-primary w-10 text-center">{groupCount}</span>
                <button
                  onClick={() => setGroupCountClamped(groupCount + 1)}
                  disabled={groupCount >= 6}
                  className="w-10 h-10 rounded-xl bg-app-secondary border border-white/10 text-text-primary text-lg font-bold disabled:opacity-30"
                >
                  +
                </button>
              </div>
              <p className="text-[10px] text-text-muted text-center">
                {t('nominations.bracket.wizard.groupNamesPreview', { names: GROUP_LETTERS.slice(0, groupCount).join(', ') })}
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">{t('nominations.bracket.wizard.teamsTitle')}</h3>
                <p className="text-xs text-text-secondary mt-0.5">{t('nominations.bracket.wizard.teamsDescription')}</p>
              </div>
              {Array.from({ length: groupCount }).map((_, gi) => (
                <div key={gi} className="bg-app-secondary rounded-xl border border-white/10 p-3 space-y-2">
                  <h4 className="text-xs font-semibold text-app-cyan">{t('nominations.group')} {GROUP_LETTERS[gi]}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {groupTeams[gi]?.map((team, ti) => (
                      <span key={ti} className="flex items-center gap-1 px-2 py-1 text-[10px] bg-app-card border border-white/10 rounded-lg text-text-primary">
                        {team}
                        <button onClick={() => removeTeam(gi, ti)} className="text-text-muted hover:text-chart-pink">×</button>
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      value={teamInputs[gi] || ''}
                      onChange={e => setTeamInputs(prev => prev.map((v, i) => (i === gi ? e.target.value : v)))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTeam(gi); } }}
                      placeholder={t('nominations.bracket.wizard.teamNamePlaceholder')}
                      className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-app-card border border-white/10 rounded-lg text-text-primary"
                    />
                    <button
                      onClick={() => addTeam(gi)}
                      disabled={!teamInputs[gi]?.trim()}
                      className="px-2.5 py-1.5 text-[10px] font-semibold bg-app-card border border-white/10 text-app-cyan rounded-lg disabled:opacity-30 flex-shrink-0"
                    >
                      + {t('common.add')}
                    </button>
                  </div>
                  {(groupTeams[gi]?.length || 0) < 2 && (
                    <p className="text-[9px] text-text-muted">{t('nominations.bracket.wizard.needTwoTeams')}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {step === 3 && playoffStepShown && (
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">{t('nominations.bracket.wizard.playoffsTitle')}</h3>
                <p className="text-xs text-text-secondary mt-0.5">{t('nominations.bracket.wizard.playoffsDescription')}</p>
              </div>
              <label className="flex items-center gap-2 px-3 py-2 bg-app-secondary rounded-xl border border-white/10 cursor-pointer">
                <input type="checkbox" checked={playoffEnabled} onChange={e => setPlayoffEnabled(e.target.checked)} />
                <span className="text-xs text-text-primary">{t('nominations.bracket.wizard.enablePlayoffs')}</span>
              </label>

              {playoffEnabled && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-text-secondary uppercase">{t('nominations.bracket.wizard.advanceCountLabel')}</p>
                  {([1, 2, 3, 4] as WizardAdvanceCount[]).map(n => (
                    <label key={n} className="flex items-start gap-2 px-3 py-2 bg-app-secondary rounded-xl border border-white/10 cursor-pointer">
                      <input
                        type="radio"
                        name="advanceCount"
                        checked={advanceCount === n}
                        onChange={() => setAdvanceCount(n)}
                        className="mt-0.5"
                      />
                      <span className="text-xs text-text-primary">{t(`nominations.bracket.wizard.advanceOption${n}`)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">{t('nominations.bracket.wizard.scheduleTitle')}</h3>
                <p className="text-xs text-text-secondary mt-0.5">{t('nominations.bracket.wizard.scheduleDescription')}</p>
              </div>
              <label className="flex items-center gap-2 px-3 py-2 bg-app-secondary rounded-xl border border-white/10 cursor-pointer">
                <input type="checkbox" checked={scheduleEnabled} onChange={e => setScheduleEnabled(e.target.checked)} />
                <span className="text-xs text-text-primary">{t('nominations.bracket.wizard.enableSchedule')}</span>
              </label>
              {scheduleEnabled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-text-muted">{t('nominations.bracket.wizard.firstStartTimeLabel')}</label>
                    <input
                      type="time"
                      value={firstStartTime}
                      onChange={e => setFirstStartTime(e.target.value)}
                      className="w-full mt-0.5 px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-text-muted">{t('nominations.bracket.wizard.minutesPerGameLabel')}</label>
                    <input
                      type="number"
                      min={1}
                      value={minutesPerGame}
                      onChange={e => setMinutesPerGame(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full mt-0.5 px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                    />
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-white/5 space-y-1">
                <h3 className="text-sm font-semibold text-text-primary">{t('nominations.bracket.wizard.reviewTitle')}</h3>
                <p className="text-xs text-text-secondary">
                  {t('nominations.bracket.wizard.reviewSummary', {
                    groups: groupCount,
                    teams: groupTeams.reduce((s, teams) => s + teams.length, 0),
                    groupMatches: groupStageMatchCount,
                    playoffMatches: playoffMatchCount,
                  })}
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4 mt-2">
            {step > 1 && (
              <button
                onClick={goBack}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
              >
                {t('common.back')}
              </button>
            )}
            {step < lastStep ? (
              <button
                onClick={goNext}
                disabled={(step === 1 && groupCount < 1) || (step === 2 && !allGroupsHaveEnoughTeams)}
                className="flex-1 px-4 py-2.5 bg-gradient-primary rounded-xl text-sm font-semibold text-white shadow-button hover:shadow-button-hover transition-all disabled:opacity-50"
              >
                {t('common.next')}
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={saving || !allGroupsHaveEnoughTeams}
                className="flex-1 px-4 py-2.5 bg-gradient-primary rounded-xl text-sm font-semibold text-white shadow-button hover:shadow-button-hover transition-all disabled:opacity-50"
              >
                {saving ? t('common.saving') : t('nominations.bracket.wizard.createButton')}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
