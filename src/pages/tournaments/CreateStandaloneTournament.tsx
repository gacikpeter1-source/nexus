/**
 * Guided, step-by-step creation of a standalone (plain) tournament — no club
 * or team attached, no roster/RSVP. Reached from Tools > Tournaments.
 * Steps: title → import teams (Excel or pasted, comma-separated) → groups →
 * format → review & create → success (public link + QR, emailed to the
 * creator via the sendTournamentCreatedEmail Cloud Function once the
 * Firebase "Trigger Email" extension is configured).
 *
 * Group re-assignment is a tap-to-move dropdown per team rather than drag-
 * and-drop — native HTML5 drag-and-drop doesn't work on iOS Safari touch,
 * and this app is mobile-first.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { createStandaloneTournament, getTournamentFormats, addCustomTournamentFormat } from '../../services/firebase/standaloneTournaments';
import { parseTeamsWorkbook, parseTeamsWorkbookAnyGroup } from '../../utils/tournamentExcel';
import {
  parsePastedTeamNames,
  findDuplicateTeamNames,
  randomlySplitIntoGroups,
  buildGroupStageBracket,
  appendCrossSeededPlayoffs,
  buildSingleEliminationBracket,
  buildDoubleEliminationBracket,
  allSurfaces,
  applyRinkAwareSchedule,
  type WizardAdvanceCount,
} from '../../utils/tournamentBracket';
import type { TournamentBracket, TournamentFormat, TournamentRink, RinkLayout } from '../../types';

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const TOTAL_STEPS = 7;
const STAFF_ROLES = ['clubOwner', 'trainer', 'assistant', 'admin'];
const RINK_LAYOUTS: RinkLayout[] = ['full', 'halfCrossIce', 'thirdsCrossIce', 'halfLengthwise'];

export default function CreateStandaloneTournament() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const isStaff = !!user && (STAFF_ROLES.includes(user.role) || user.isSuperAdmin);

  const [step, setStep] = useState(1);
  const [maxStepReached, setMaxStepReached] = useState(1);

  // Step 1 — basic info
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');

  // Step 2 — team import
  const [pasteText, setPasteText] = useState('');
  const [importedTeams, setImportedTeams] = useState<string[]>([]);
  const [importedGroups, setImportedGroups] = useState<{ name: string; teams: string[] }[] | null>(null);
  const [importing, setImporting] = useState(false);
  const excelFileInputRef = useRef<HTMLInputElement>(null);

  // Step 3 — groups
  const [groupCount, setGroupCount] = useState(1);
  const [groupNames, setGroupNames] = useState<string[]>(['A']);
  const [groups, setGroups] = useState<string[][]>([[]]);
  const [groupTeamInputs, setGroupTeamInputs] = useState<string[]>(['']);

  // Step 4 — format
  const [formats, setFormats] = useState<TournamentFormat[]>([]);
  const [loadingFormats, setLoadingFormats] = useState(true);
  const [selectedFormatId, setSelectedFormatId] = useState('');
  const [playoffEnabled, setPlayoffEnabled] = useState(true);
  const [advanceCount, setAdvanceCount] = useState<WizardAdvanceCount>(2);
  const [showAddFormat, setShowAddFormat] = useState(false);
  const [customFormatName, setCustomFormatName] = useState('');
  const [customFormatDesc, setCustomFormatDesc] = useState('');
  const [savingFormat, setSavingFormat] = useState(false);

  // Step 5 — rinks / playing surfaces
  const [rinkCount, setRinkCount] = useState(1);
  const [rinkNames, setRinkNames] = useState<string[]>(['']);
  const [rinkLayouts, setRinkLayouts] = useState<RinkLayout[]>(['full']);

  // Step 6 — schedule
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [firstStartTime, setFirstStartTime] = useState('09:00');
  const [gameMinutes, setGameMinutes] = useState(45);
  const [breakMinutes, setBreakMinutes] = useState(10);

  // Step 7 — review & create
  const [creating, setCreating] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState('');
  const [emailTag, setEmailTag] = useState('');
  const [teamEmails, setTeamEmails] = useState<Record<string, string>>({});
  const [clubDirectory, setClubDirectory] = useState<{ name: string; email: string }[]>([]);

  useEffect(() => {
    // Pre-fill from the account's own email once it's loaded; staff can
    // still edit it (or clear it to skip the email) — some accounts have
    // no email on file at all, so this can't just be read at submit time.
    if (user?.email) setNotifyEmail(email => email || user.email!);
  }, [user?.email]);

  // Registered clubs' contact email (Club Settings > General) — used to
  // auto-fill a team's invite email when its name matches a registered club,
  // so the creator doesn't have to type an address that's already on file.
  // Club docs are broadly readable (any signed-in user, for the join-request
  // flow), so no rules change is needed for this lookup.
  useEffect(() => {
    getDocs(collection(db, 'clubs'))
      .then(snap => {
        const dir = snap.docs
          .map(d => ({ name: String(d.data().name || ''), email: String(d.data().contactEmail || '') }))
          .filter(c => c.name && c.email);
        setClubDirectory(dir);
      })
      .catch(err => console.error('CreateStandaloneTournament: load club directory failed', err));
  }, []);

  useEffect(() => {
    getTournamentFormats()
      .then(list => {
        setFormats(list);
        if (list.length > 0) setSelectedFormatId(list[0].id);
      })
      .catch(err => console.error('CreateStandaloneTournament: load formats failed', err))
      .finally(() => setLoadingFormats(false));
  }, []);

  const goTo = (s: number) => {
    if (s <= maxStepReached) setStep(s);
  };
  const advanceTo = (s: number) => {
    setStep(s);
    setMaxStepReached(m => Math.max(m, s));
  };

  // ── Step 2: import ──────────────────────────────────────────────────────

  const applyFlatTeams = (names: string[]) => {
    setImportedTeams(names);
    setImportedGroups(null);
  };

  const handlePasteConfirm = () => {
    applyFlatTeams(parsePastedTeamNames(pasteText));
  };

  const handleExcelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImporting(true);
    try {
      const sheetName = t('nominations.bracket.excel.sheetTeams');
      const strictRows = await parseTeamsWorkbook(file, sheetName);
      if (strictRows.length > 0) {
        const byGroup = new Map<string, string[]>();
        for (const row of strictRows) {
          const list = byGroup.get(row.group) || [];
          if (!list.includes(row.teamName)) list.push(row.teamName);
          byGroup.set(row.group, list);
        }
        setImportedTeams(strictRows.map(r => r.teamName));
        setImportedGroups(Array.from(byGroup.entries()).map(([name, teams]) => ({ name, teams })));
      } else {
        const anyRows = await parseTeamsWorkbookAnyGroup(file, sheetName);
        applyFlatTeams(Array.from(new Set(anyRows.map(r => r.teamName))));
      }
    } catch (err) {
      console.error('CreateStandaloneTournament: excel import failed', err);
      alert(t('nominations.bracket.excel.parseFailed'));
    } finally {
      setImporting(false);
    }
  };

  const proceedToGroups = () => {
    // Pasted text that was typed but never explicitly confirmed with "Use
    // this list" would otherwise be silently dropped here — merge it in so
    // teams don't vanish just because that extra click was missed.
    const pastedNames = parsePastedTeamNames(pasteText);
    const teams = pastedNames.length > 0
      ? Array.from(new Set([...importedTeams, ...pastedNames]))
      : importedTeams;

    if (importedGroups) {
      setGroupCount(importedGroups.length);
      setGroupNames(importedGroups.map(g => g.name));
      setGroups(importedGroups.map(g => g.teams));
      setGroupTeamInputs(importedGroups.map(() => ''));
    } else {
      setGroupCount(1);
      setGroupNames(['A']);
      setGroups([teams]);
      setGroupTeamInputs(['']);
    }
    advanceTo(3);
  };

  const importedDuplicates = findDuplicateTeamNames(importedTeams);

  // ── Step 3: groups ──────────────────────────────────────────────────────

  const setGroupCountClamped = (n: number) => {
    const clamped = Math.max(1, Math.min(8, n));
    const flat = groups.flat();
    const nextGroups: string[][] = Array.from({ length: clamped }, () => []);
    flat.forEach((team, i) => nextGroups[i % clamped].push(team));
    setGroups(nextGroups);
    setGroupNames(Array.from({ length: clamped }, (_, i) => GROUP_LETTERS[i] || `${i + 1}`));
    setGroupTeamInputs(Array.from({ length: clamped }, () => ''));
    setGroupCount(clamped);
  };

  const randomSplit = () => {
    setGroups(randomlySplitIntoGroups(groups.flat(), groupCount));
  };

  const reassignTeam = (fromGi: number, team: string, toGi: number) => {
    if (fromGi === toGi) return;
    setGroups(prev => prev.map((g, i) => {
      if (i === fromGi) return g.filter(x => x !== team);
      if (i === toGi) return [...g, team];
      return g;
    }));
  };

  const removeTeamFromGroup = (gi: number, team: string) => {
    setGroups(prev => prev.map((g, i) => (i === gi ? g.filter(x => x !== team) : g)));
  };

  const addTeamToGroup = (gi: number) => {
    const name = (groupTeamInputs[gi] || '').trim();
    if (!name) return;
    setGroups(prev => prev.map((g, i) => (i === gi ? [...g, name] : g)));
    setGroupTeamInputs(prev => prev.map((v, i) => (i === gi ? '' : v)));
  };

  const allTeamsFlat = groups.flat();
  const groupDuplicates = findDuplicateTeamNames(allTeamsFlat);
  const canProceedFromGroups = allTeamsFlat.length >= 2;

  // Auto-fill a team's invite email the first time its name matches a
  // registered club — never overwrites an email the creator already typed
  // (or cleared) themselves, since that already exists as a key in teamEmails.
  useEffect(() => {
    if (clubDirectory.length === 0) return;
    const updates: Record<string, string> = {};
    for (const name of allTeamsFlat) {
      if (name in teamEmails) continue;
      const match = clubDirectory.find(c => c.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (match) updates[name] = match.email;
    }
    if (Object.keys(updates).length > 0) {
      setTeamEmails(prev => ({ ...prev, ...updates }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTeamsFlat.join('|'), clubDirectory]);

  // ── Step 4: format ──────────────────────────────────────────────────────

  const selectedFormat = formats.find(f => f.id === selectedFormatId);

  const formatLabel = (f: TournamentFormat) =>
    f.isCustom ? f.name : t(`nominations.bracket.wizard.formats.${f.key}.name`);
  const formatDescription = (f: TournamentFormat) =>
    f.isCustom ? (f.description || '') : t(`nominations.bracket.wizard.formats.${f.key}.description`);

  const handleAddCustomFormat = async () => {
    const name = customFormatName.trim();
    if (!name || !user) return;
    setSavingFormat(true);
    try {
      const id = await addCustomTournamentFormat({ name, description: customFormatDesc.trim() || undefined, createdBy: user.id });
      const list = await getTournamentFormats();
      setFormats(list);
      setSelectedFormatId(id);
      setCustomFormatName('');
      setCustomFormatDesc('');
      setShowAddFormat(false);
    } catch (err) {
      console.error('CreateStandaloneTournament: add custom format failed', err);
      alert(t('nominations.errors.bracketSaveFailed'));
    } finally {
      setSavingFormat(false);
    }
  };

  // ── Step 5: rinks / playing surfaces ────────────────────────────────────

  const defaultRinkName = (i: number) => t('nominations.bracket.wizard.standaloneDefaultRinkName', { n: i + 1 });

  const setRinkCountClamped = (n: number) => {
    const clamped = Math.max(1, Math.min(4, n));
    setRinkNames(prev => Array.from({ length: clamped }, (_, i) => prev[i] || ''));
    setRinkLayouts(prev => Array.from({ length: clamped }, (_, i) => prev[i] || 'full'));
    setRinkCount(clamped);
  };

  const rinks: TournamentRink[] = useMemo(
    () => Array.from({ length: rinkCount }, (_, i) => ({
      id: crypto.randomUUID(),
      name: rinkNames[i]?.trim() || defaultRinkName(i),
      layout: rinkLayouts[i] || 'full',
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rinkCount, rinkNames, rinkLayouts, t]
  );
  const surfaceCount = allSurfaces(rinks).length;

  // ── Steps 6-7: schedule + computed bracket + create ─────────────────────

  const eliminationLabels = useMemo(() => ({
    bye: t('nominations.bracket.wizard.standaloneBye'),
    final: t('nominations.bracket.wizard.labelFinal'),
    semifinal: t('nominations.bracket.wizard.standaloneSemifinal'),
    quarterfinal: t('nominations.bracket.wizard.standaloneQuarterfinal'),
    roundOf: (n: number) => t('nominations.bracket.wizard.standaloneRoundOf', { n }),
    grandFinal: t('nominations.bracket.wizard.standaloneGrandFinal'),
    losersRound: (n: number) => t('nominations.bracket.wizard.standaloneLosersRound', { n }),
  }), [t]);

  const finalBracket: TournamentBracket = useMemo(() => {
    if (!selectedFormat) return { groups: [], matches: [], rinks };
    const groupInputs = groups.map((teams, i) => ({ name: groupNames[i] || GROUP_LETTERS[i] || `${i + 1}`, teamNames: teams }));

    let bracket: TournamentBracket;
    if (selectedFormat.key === 'roundRobin') {
      bracket = buildGroupStageBracket(groupInputs);
    } else if (selectedFormat.key === 'groupsPlayoffs') {
      bracket = buildGroupStageBracket(groupInputs);
      if (groups.length === 2 && playoffEnabled) {
        bracket = appendCrossSeededPlayoffs(bracket, advanceCount, {
          semifinal1: t('nominations.bracket.wizard.labelSemifinal1'),
          semifinal2: t('nominations.bracket.wizard.labelSemifinal2'),
          thirdPlace: t('nominations.bracket.wizard.labelThirdPlace'),
          final: t('nominations.bracket.wizard.labelFinal'),
          place5to6: t('nominations.bracket.wizard.labelPlace5to6'),
          place7to8: t('nominations.bracket.wizard.labelPlace7to8'),
        });
      }
    } else if (selectedFormat.key === 'singleElimination') {
      bracket = buildSingleEliminationBracket(allTeamsFlat, eliminationLabels);
    } else if (selectedFormat.key === 'doubleElimination') {
      bracket = buildDoubleEliminationBracket(allTeamsFlat, eliminationLabels);
    } else {
      // Custom format — no auto-generated matches, just the group shell to build on manually.
      bracket = { groups: groupInputs.map(g => ({ id: crypto.randomUUID(), name: g.name })), matches: [] };
    }

    bracket = { ...bracket, rinks };
    if (scheduleEnabled) {
      bracket = applyRinkAwareSchedule(bracket, { firstStartTime, gameMinutes, breakMinutes });
    }
    return bracket;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFormat, groups, groupNames, playoffEnabled, advanceCount, eliminationLabels, rinks, scheduleEnabled, firstStartTime, gameMinutes, breakMinutes]);

  const groupStageMatchCount = finalBracket.matches.filter(m => m.groupId).length;
  const playoffMatchCount = finalBracket.matches.length - groupStageMatchCount;

  const handleCreate = async () => {
    if (!user) return;
    setCreating(true);
    try {
      const teamContacts = Object.fromEntries(
        Object.entries(teamEmails)
          .map(([name, email]) => [name, email.trim()])
          .filter(([, email]) => email.length > 0)
      );

      const id = await createStandaloneTournament({
        title: title.trim(),
        location: location.trim() || undefined,
        creatorId: user.id,
        creatorEmail: notifyEmail.trim() || undefined,
        formatId: selectedFormat!.id,
        formatKey: selectedFormat!.key,
        bracket: finalBracket,
        teamContacts,
        emailTag: emailTag.trim() || undefined,
      });
      setCreatedId(id);
    } catch (err) {
      console.error('CreateStandaloneTournament: create failed', err);
      alert(t('nominations.errors.bracketSaveFailed'));
    } finally {
      setCreating(false);
    }
  };

  const tvUrl = createdId ? `${window.location.origin}/tv/${createdId}` : '';

  useEffect(() => {
    if (createdId && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, tvUrl, {
        width: 260,
        margin: 2,
        color: { dark: '#FFFFFF', light: '#1A1F2E' },
      }).catch(err => console.error('CreateStandaloneTournament: QR generation failed', err));
    }
  }, [createdId, tvUrl]);

  const downloadQr = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `${(title || 'tournament').replace(/\s+/g, '-').toLowerCase()}-qr.png`;
    link.href = canvasRef.current.toDataURL();
    link.click();
  };

  const copyLink = () => {
    navigator.clipboard.writeText(tvUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isStaff) {
    return (
      <Container>
        <div className="py-16 text-center">
          <h1 className="text-lg font-bold text-text-primary mb-2">{t('tools.noAccess')}</h1>
          <Link to="/" className="text-app-cyan hover:text-app-cyan/80">{t('nav.dashboard')}</Link>
        </div>
      </Container>
    );
  }

  // ── Success screen ──────────────────────────────────────────────────────

  if (createdId) {
    return (
      <Container>
        <div className="py-6 max-w-md mx-auto space-y-4">
          <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-5 text-center space-y-4">
            <h1 className="text-lg font-bold text-text-primary">{t('nominations.bracket.wizard.standaloneCreatedTitle')}</h1>
            <p className="text-xs text-text-secondary">{t('nominations.bracket.wizard.standaloneCreatedDescription')}</p>

            <div className="bg-app-primary rounded-xl p-4 flex justify-center">
              <canvas ref={canvasRef} />
            </div>

            <div className="bg-app-secondary border border-white/10 rounded-lg p-3">
              <p className="text-[10px] text-text-muted mb-1">{t('tv.scanToFollow')}</p>
              <p className="text-xs text-text-primary break-all font-mono">{tvUrl}</p>
            </div>

            {notifyEmail.trim() && (
              <p className="text-[10px] text-text-muted">
                {t('nominations.bracket.wizard.standaloneEmailNote', { email: notifyEmail.trim() })}
              </p>
            )}
            {Object.values(teamEmails).some(e => e.trim()) && (
              <p className="text-[10px] text-text-muted">
                {t('nominations.bracket.wizard.standaloneTeamEmailsNote', {
                  count: Object.values(teamEmails).filter(e => e.trim()).length,
                })}
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={copyLink}
                className="flex-1 px-4 py-2.5 bg-app-secondary border border-white/10 text-sm font-semibold text-text-primary rounded-xl hover:bg-white/10 transition-colors"
              >
                {copied ? t('common.copied') : t('common.copyLink')}
              </button>
              <button
                onClick={downloadQr}
                className="flex-1 px-4 py-2.5 bg-gradient-primary rounded-xl text-sm font-semibold text-white shadow-button hover:shadow-button-hover transition-all"
              >
                {t('nominations.bracket.wizard.downloadQr')}
              </button>
            </div>

            <button
              onClick={() => navigate(`/tournaments/${createdId}`)}
              className="w-full px-4 py-2.5 text-xs font-semibold text-app-cyan hover:text-app-cyan/80 transition-colors"
            >
              {t('nominations.bracket.wizard.manageTournament')} →
            </button>
          </div>
        </div>
      </Container>
    );
  }

  // ── Wizard steps ────────────────────────────────────────────────────────

  return (
    <Container>
      <div className="py-6 max-w-md mx-auto space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold text-text-primary">{t('nominations.bracket.wizard.standaloneTitle')}</h1>
          <Link to="/tools/tournaments" className="text-xs text-app-cyan hover:text-app-cyan/80">← {t('tools.title')}</Link>
        </div>

        {/* Step pills — jump back to any step already reached */}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map(s => (
            <button
              key={s}
              onClick={() => goTo(s)}
              disabled={s > maxStepReached}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                s === step ? 'bg-app-cyan' : s <= maxStepReached ? 'bg-app-cyan/40' : 'bg-white/10'
              }`}
            />
          ))}
        </div>

        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 space-y-3">
          {step === 1 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-text-primary">{t('nominations.bracket.wizard.standaloneStep1Title')}</h2>
              <div>
                <label className="text-[10px] text-text-muted">{t('nominations.title')}</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full mt-0.5 px-2.5 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                />
              </div>
              <div>
                <label className="text-[10px] text-text-muted">{t('nominations.bracket.wizard.standaloneLocation')}</label>
                <input
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className="w-full mt-0.5 px-2.5 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-text-primary">{t('nominations.bracket.wizard.standaloneStep2Title')}</h2>
              <p className="text-xs text-text-secondary">{t('nominations.bracket.wizard.standaloneStep2Description')}</p>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => excelFileInputRef.current?.click()}
                  disabled={importing}
                  className="px-2.5 py-1.5 text-[10px] font-semibold bg-app-secondary border border-white/10 text-app-cyan rounded-lg hover:border-app-cyan transition-colors disabled:opacity-50"
                >
                  {importing ? t('common.loading') : t('nominations.bracket.excel.importButton')}
                </button>
                <input ref={excelFileInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelFile} className="hidden" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-text-muted">{t('nominations.bracket.wizard.standalonePasteLabel')}</label>
                <textarea
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  rows={3}
                  placeholder={t('nominations.bracket.wizard.standalonePastePlaceholder')}
                  className="w-full px-2.5 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                />
                <button
                  onClick={handlePasteConfirm}
                  disabled={!pasteText.trim()}
                  className="px-2.5 py-1.5 text-[10px] font-semibold bg-app-secondary border border-white/10 text-app-cyan rounded-lg disabled:opacity-30"
                >
                  {t('nominations.bracket.wizard.standaloneUseThisList')}
                </button>
              </div>

              {(importedTeams.length > 0 || importedGroups) && (
                <div className="pt-2 border-t border-white/5 space-y-1.5">
                  <p className="text-[10px] font-semibold text-text-secondary uppercase">
                    {importedGroups
                      ? t('nominations.bracket.wizard.standaloneGroupsDetected', { count: importedGroups.length })
                      : t('nominations.bracket.wizard.standaloneTeamsImported', { count: importedTeams.length })}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {importedTeams.map((name, i) => (
                      <span key={i} className="px-2 py-0.5 text-[10px] bg-app-secondary border border-white/10 rounded text-text-primary">{name}</span>
                    ))}
                  </div>
                  {importedDuplicates.length > 0 && (
                    <p className="text-[9px] text-chart-pink">
                      {t('nominations.bracket.wizard.standaloneDuplicatesWarning', { names: importedDuplicates.join(', ') })}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-text-primary">{t('nominations.bracket.wizard.standaloneStep3Title')}</h2>

              {groupDuplicates.length > 0 && (
                <p className="text-[9px] text-chart-pink">
                  {t('nominations.bracket.wizard.standaloneDuplicatesWarning', { names: groupDuplicates.join(', ') })}
                </p>
              )}

              <div className="flex items-center justify-between gap-2">
                <label className="text-[10px] text-text-secondary">{t('nominations.bracket.wizard.groupsTitle')}</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setGroupCountClamped(groupCount - 1)}
                    disabled={groupCount <= 1}
                    className="w-7 h-7 rounded-lg bg-app-secondary border border-white/10 text-text-primary font-bold disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className="text-sm font-bold text-text-primary w-5 text-center">{groupCount}</span>
                  <button
                    onClick={() => setGroupCountClamped(groupCount + 1)}
                    disabled={groupCount >= 8}
                    className="w-7 h-7 rounded-lg bg-app-secondary border border-white/10 text-text-primary font-bold disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              </div>
              {groupCount > 1 && (
                <button
                  onClick={randomSplit}
                  className="w-full px-2.5 py-1.5 text-[10px] font-semibold bg-app-secondary border border-white/10 text-app-cyan rounded-lg hover:border-app-cyan transition-colors"
                >
                  🎲 {t('nominations.bracket.wizard.standaloneRandomSplit')}
                </button>
              )}

              {groups.map((teams, gi) => (
                <div key={gi} className="bg-app-secondary rounded-xl border border-white/10 p-3 space-y-2">
                  <h4 className="text-xs font-semibold text-app-cyan">{t('nominations.group')} {groupNames[gi]}</h4>
                  <div className="space-y-1">
                    {teams.map(team => (
                      <div key={team} className="flex items-center gap-1.5">
                        <span className="flex-1 min-w-0 truncate text-xs text-text-primary px-2 py-1 bg-app-card rounded border border-white/10">{team}</span>
                        {groupCount > 1 && (
                          <select
                            value={gi}
                            onChange={e => reassignTeam(gi, team, Number(e.target.value))}
                            className="px-1.5 py-1 text-[10px] bg-app-card border border-white/10 rounded text-text-primary flex-shrink-0"
                          >
                            {groupNames.map((name, i) => <option key={i} value={i}>{name}</option>)}
                          </select>
                        )}
                        <button onClick={() => removeTeamFromGroup(gi, team)} className="text-text-muted hover:text-chart-pink flex-shrink-0 px-1">×</button>
                      </div>
                    ))}
                  </div>
                  {(groupCount > 1 || teams.length === 0) && (
                    <div className="flex items-center gap-1.5">
                      <input
                        value={groupTeamInputs[gi] || ''}
                        onChange={e => setGroupTeamInputs(prev => prev.map((v, i) => (i === gi ? e.target.value : v)))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTeamToGroup(gi); } }}
                        placeholder={t('nominations.bracket.wizard.teamNamePlaceholder')}
                        className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-app-card border border-white/10 rounded-lg text-text-primary"
                      />
                      <button
                        onClick={() => addTeamToGroup(gi)}
                        disabled={!groupTeamInputs[gi]?.trim()}
                        className="px-2.5 py-1.5 text-[10px] font-semibold bg-app-card border border-white/10 text-app-cyan rounded-lg disabled:opacity-30 flex-shrink-0"
                      >
                        + {t('common.add')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {groupCount === 1 && groups[0]?.length > 0 && (
                <p className="text-[10px] text-text-muted">{t('nominations.bracket.wizard.standaloneSingleGroupNote')}</p>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-text-primary">{t('nominations.bracket.wizard.standaloneStep4Title')}</h2>

              {loadingFormats ? (
                <div className="flex justify-center py-6">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-app-cyan" />
                </div>
              ) : (
                <div className="space-y-1.5">
                  {formats.map(f => (
                    <label key={f.id} className="flex items-start gap-2 px-3 py-2 bg-app-secondary rounded-xl border border-white/10 cursor-pointer">
                      <input type="radio" name="format" checked={selectedFormatId === f.id} onChange={() => setSelectedFormatId(f.id)} className="mt-0.5" />
                      <span>
                        <span className="block text-xs font-semibold text-text-primary">{formatLabel(f)}</span>
                        <span className="block text-[10px] text-text-muted">{formatDescription(f)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {selectedFormat?.key === 'groupsPlayoffs' && groups.length === 2 && (
                <div className="pt-2 border-t border-white/5 space-y-1.5">
                  <label className="flex items-center gap-2 px-3 py-2 bg-app-secondary rounded-xl border border-white/10 cursor-pointer">
                    <input type="checkbox" checked={playoffEnabled} onChange={e => setPlayoffEnabled(e.target.checked)} />
                    <span className="text-xs text-text-primary">{t('nominations.bracket.wizard.enablePlayoffs')}</span>
                  </label>
                  {playoffEnabled && ([1, 2, 3, 4] as WizardAdvanceCount[]).map(n => (
                    <label key={n} className="flex items-start gap-2 px-3 py-2 bg-app-secondary rounded-xl border border-white/10 cursor-pointer">
                      <input type="radio" name="advanceCount" checked={advanceCount === n} onChange={() => setAdvanceCount(n)} className="mt-0.5" />
                      <span className="text-xs text-text-primary">{t(`nominations.bracket.wizard.advanceOption${n}`)}</span>
                    </label>
                  ))}
                </div>
              )}
              {selectedFormat?.key === 'groupsPlayoffs' && groups.length !== 2 && (
                <p className="text-[10px] text-text-muted">{t('nominations.bracket.wizard.playoffsUnavailableNote')}</p>
              )}
              {(selectedFormat?.key === 'singleElimination' || selectedFormat?.key === 'doubleElimination') && groups.length > 1 && (
                <p className="text-[10px] text-text-muted">{t('nominations.bracket.wizard.standaloneEliminationIgnoresGroups')}</p>
              )}
              {selectedFormat?.key === 'custom' && (
                <p className="text-[10px] text-text-muted">{t('nominations.bracket.wizard.standaloneCustomNote')}</p>
              )}

              <div className="pt-2 border-t border-white/5">
                {showAddFormat ? (
                  <div className="space-y-1.5">
                    <input
                      value={customFormatName}
                      onChange={e => setCustomFormatName(e.target.value)}
                      placeholder={t('nominations.bracket.wizard.customFormatNamePlaceholder')}
                      className="w-full px-2.5 py-2 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                    />
                    <input
                      value={customFormatDesc}
                      onChange={e => setCustomFormatDesc(e.target.value)}
                      placeholder={t('nominations.bracket.wizard.customFormatDescPlaceholder')}
                      className="w-full px-2.5 py-2 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                    />
                    <button
                      onClick={handleAddCustomFormat}
                      disabled={savingFormat || !customFormatName.trim()}
                      className="w-full px-2.5 py-1.5 text-[10px] font-semibold bg-gradient-primary text-white rounded-lg disabled:opacity-50"
                    >
                      {savingFormat ? t('common.saving') : t('common.save')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddFormat(true)}
                    className="text-[10px] font-semibold text-app-cyan hover:text-app-cyan/80"
                  >
                    + {t('nominations.bracket.wizard.addCustomFormat')}
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-text-primary">{t('nominations.bracket.wizard.standaloneStep5Title')}</h2>
              <p className="text-xs text-text-secondary">{t('nominations.bracket.wizard.standaloneRinksDescription')}</p>

              <div className="flex items-center justify-between gap-2">
                <label className="text-[10px] text-text-secondary">{t('nominations.bracket.manageRinks')}</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRinkCountClamped(rinkCount - 1)}
                    disabled={rinkCount <= 1}
                    className="w-7 h-7 rounded-lg bg-app-secondary border border-white/10 text-text-primary font-bold disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className="text-sm font-bold text-text-primary w-5 text-center">{rinkCount}</span>
                  <button
                    onClick={() => setRinkCountClamped(rinkCount + 1)}
                    disabled={rinkCount >= 4}
                    className="w-7 h-7 rounded-lg bg-app-secondary border border-white/10 text-text-primary font-bold disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              </div>

              {Array.from({ length: rinkCount }, (_, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    value={rinkNames[i] || ''}
                    onChange={e => setRinkNames(prev => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
                    placeholder={defaultRinkName(i)}
                    className="flex-1 min-w-0 px-2.5 py-2 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                  />
                  <select
                    value={rinkLayouts[i] || 'full'}
                    onChange={e => setRinkLayouts(prev => prev.map((v, idx) => (idx === i ? e.target.value as RinkLayout : v)))}
                    className="px-2 py-2 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary flex-shrink-0"
                  >
                    {RINK_LAYOUTS.map(layout => (
                      <option key={layout} value={layout}>{t(`nominations.bracket.layouts.${layout}`)}</option>
                    ))}
                  </select>
                </div>
              ))}

              <p className="text-[10px] text-text-muted">
                {t('nominations.bracket.wizard.standaloneSurfacesSummary', { count: surfaceCount })}
              </p>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-text-primary">{t('nominations.bracket.wizard.standaloneStep6Title')}</h2>
              <p className="text-xs text-text-secondary">{t('nominations.bracket.wizard.standaloneScheduleDescription')}</p>

              <label className="flex items-center gap-2 px-3 py-2 bg-app-secondary rounded-xl border border-white/10 cursor-pointer">
                <input type="checkbox" checked={scheduleEnabled} onChange={e => setScheduleEnabled(e.target.checked)} />
                <span className="text-xs text-text-primary">{t('nominations.bracket.wizard.enableSchedule')}</span>
              </label>

              {scheduleEnabled && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                      <label className="text-[10px] text-text-muted">{t('nominations.bracket.wizard.standaloneGameMinutesLabel')}</label>
                      <input
                        type="number"
                        min={1}
                        value={gameMinutes}
                        onChange={e => setGameMinutes(Math.max(1, Number(e.target.value) || 1))}
                        className="w-full mt-0.5 px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-text-muted">{t('nominations.bracket.wizard.standaloneBreakMinutesLabel')}</label>
                      <input
                        type="number"
                        min={0}
                        value={breakMinutes}
                        onChange={e => setBreakMinutes(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full mt-0.5 px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-text-muted">
                    {t('nominations.bracket.wizard.standaloneScheduleSurfaceNote', { count: surfaceCount })}
                  </p>
                </>
              )}
              <p className="text-[10px] text-text-muted">{t('nominations.bracket.wizard.standaloneScheduleEditLaterNote')}</p>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-text-primary">{t('nominations.bracket.wizard.reviewTitle')}</h2>
              <div className="space-y-1 text-xs text-text-secondary">
                <p><span className="text-text-muted">{t('nominations.title')}:</span> {title || '—'}</p>
                {location.trim() && <p><span className="text-text-muted">{t('nominations.bracket.wizard.standaloneLocation')}:</span> {location}</p>}
                <p><span className="text-text-muted">{t('nominations.bracket.wizard.groupsTitle')}:</span> {groups.length} ({allTeamsFlat.length} {t('nominations.team')})</p>
                <p><span className="text-text-muted">{t('nominations.bracket.wizard.standaloneStep4Title')}:</span> {selectedFormat ? formatLabel(selectedFormat) : '—'}</p>
                <p><span className="text-text-muted">{t('nominations.bracket.manageRinks')}:</span> {rinkCount} ({surfaceCount} {t('nominations.bracket.wizard.standaloneSurfacesLabel')})</p>
                <p><span className="text-text-muted">{t('nominations.bracket.wizard.standaloneStep6Title')}:</span> {scheduleEnabled ? `${firstStartTime}, ${gameMinutes}+${breakMinutes} min` : t('nominations.bracket.wizard.standaloneScheduleOff')}</p>
                <p><span className="text-text-muted">{t('nominations.schedule')}:</span> {groupStageMatchCount} + {playoffMatchCount} = {finalBracket.matches.length}</p>
              </div>

              <div className="pt-2 border-t border-white/5">
                <label className="text-[10px] text-text-muted">{t('nominations.bracket.wizard.standaloneNotifyEmailLabel')}</label>
                <input
                  type="email"
                  value={notifyEmail}
                  onChange={e => setNotifyEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full mt-0.5 px-2.5 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                />
                <p className="text-[9px] text-text-muted mt-1">{t('nominations.bracket.wizard.standaloneNotifyEmailHint')}</p>
              </div>

              <div className="pt-2 border-t border-white/5">
                <label className="text-[10px] text-text-muted">{t('nominations.bracket.wizard.standaloneEmailTagLabel')}</label>
                <input
                  type="text"
                  value={emailTag}
                  onChange={e => setEmailTag(e.target.value)}
                  placeholder={t('nominations.bracket.wizard.standaloneEmailTagPlaceholder')}
                  className="w-full mt-0.5 px-2.5 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                />
                <p className="text-[9px] text-text-muted mt-1">{t('nominations.bracket.wizard.standaloneEmailTagHint')}</p>
              </div>

              <div className="pt-2 border-t border-white/5">
                <label className="text-[10px] text-text-muted">{t('nominations.bracket.wizard.standaloneTeamEmailsLabel')}</label>
                <p className="text-[9px] text-text-muted mt-0.5 mb-1.5">{t('nominations.bracket.wizard.standaloneTeamEmailsHint')}</p>
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {allTeamsFlat.map(name => {
                    const matched = clubDirectory.find(
                      c => c.name.trim().toLowerCase() === name.trim().toLowerCase() && c.email === (teamEmails[name] || '')
                    );
                    return (
                      <div key={name} className="flex items-center gap-2">
                        <span className="w-1/3 text-xs text-text-secondary truncate" title={name}>{name}</span>
                        <div className="flex-1 min-w-0">
                          <input
                            type="email"
                            value={teamEmails[name] || ''}
                            onChange={e => setTeamEmails(prev => ({ ...prev, [name]: e.target.value }))}
                            placeholder={t('nominations.bracket.wizard.standaloneTeamEmailPlaceholder')}
                            className="w-full px-2.5 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary"
                          />
                          {matched && (
                            <p className="text-[9px] text-app-cyan mt-0.5">{t('nominations.bracket.wizard.standaloneTeamEmailMatched')}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {step > 1 && (
            <button
              onClick={() => goTo(step - 1)}
              className="flex-1 px-4 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors"
            >
              {t('common.back')}
            </button>
          )}
          {step < TOTAL_STEPS ? (
            <button
              onClick={() => {
                if (step === 1) advanceTo(2);
                else if (step === 2) proceedToGroups();
                else advanceTo(step + 1);
              }}
              disabled={
                (step === 1 && !title.trim()) ||
                (step === 3 && !canProceedFromGroups) ||
                (step === 4 && !selectedFormat)
              }
              className="flex-1 px-4 py-2.5 bg-gradient-primary rounded-xl text-sm font-semibold text-white shadow-button hover:shadow-button-hover transition-all disabled:opacity-50"
            >
              {t('common.next')}
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex-1 px-4 py-2.5 bg-gradient-primary rounded-xl text-sm font-semibold text-white shadow-button hover:shadow-button-hover transition-all disabled:opacity-50"
            >
              {creating ? t('common.saving') : t('nominations.bracket.wizard.createButton')}
            </button>
          )}
        </div>
      </div>
    </Container>
  );
}
