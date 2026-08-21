/**
 * Nomination Detail Page
 * Adaptive: staff (trainer/assistant/club owner) get full roster management —
 * add/remove/promote, editable at any time, deadline or not. A nominated
 * recipient (or their parent) sees just their own athlete(s) with confirm/decline.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import {
  subscribeToNomination,
  updateNominationDetails,
  deleteNomination,
  addNominationEntry,
  removeNominationEntry,
  promoteNextFromBacklog,
  respondToNomination,
  getNominationCandidates,
  createManualCandidate,
  isNominationDeadlinePassed,
  type NominationCandidate,
} from '../../services/firebase/nominations';
import type { Nomination, NominationEntry } from '../../types';

function toDateTimeLocal(value: Nomination['deadline']): string {
  const d = typeof value === 'string' ? new Date(value) : value.toDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function NominationDetail() {
  const { clubId, nominationId } = useParams<{ clubId: string; nominationId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [nomination, setNomination] = useState<Nomination | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // athleteId or action key currently in flight

  const [candidates, setCandidates] = useState<NominationCandidate[]>([]);
  const [showAddPicker, setShowAddPicker] = useState<'primary' | 'backlog' | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [manualName, setManualName] = useState('');

  const [editingDetails, setEditingDetails] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDeadline, setEditDeadline] = useState('');

  useEffect(() => {
    if (!clubId || !nominationId) return;
    const unsub = subscribeToNomination(clubId, nominationId, n => {
      setNomination(n);
      setLoading(false);
    });
    return unsub;
  }, [clubId, nominationId]);

  useEffect(() => {
    if (clubId && nomination?.teamId) {
      getNominationCandidates(clubId, nomination.teamId).then(setCandidates).catch(console.error);
    }
  }, [clubId, nomination?.teamId]);

  // Staff check — matches the club-level trainer/assistant/owner pattern used for
  // this club's other staff-managed subcollections (orders, documents).
  const [isStaff, setIsStaff] = useState(false);
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

  const myEntries = Object.values(nomination.primary).filter(e => e.recipientIds.includes(user!.id));
  const deadlinePassed = isNominationDeadlinePassed(nomination);
  const primaryList = Object.values(nomination.primary).sort((a, b) => a.order - b.order);
  const backlogList = Object.values(nomination.backlog).sort((a, b) => a.order - b.order);
  const assignedIds = new Set([...primaryList.map(e => e.athleteId), ...backlogList.map(e => e.athleteId)]);
  const unassignedCandidates = candidates.filter(c => !assignedIds.has(c.athleteId));
  const availableCandidates = pickerSearch.trim()
    ? unassignedCandidates.filter(c => c.displayName.toLowerCase().includes(pickerSearch.trim().toLowerCase()))
    : unassignedCandidates;

  const gameSummary = nomination.games
    .map(g => `${g.date}${g.startTime ? ' ' + g.startTime : ''}${g.opponent ? ' vs ' + g.opponent : ''}`)
    .join(' · ');

  const handleRespond = async (athleteId: string, response: 'confirmed' | 'declined') => {
    setBusy(athleteId);
    try {
      await respondToNomination(clubId!, nominationId!, athleteId, response, user!.id);
    } catch (err) {
      console.error('NominationDetail: respond failed', err);
      alert(t('nominations.errors.respondFailed'));
    } finally {
      setBusy(null);
    }
  };

  const handleAdd = async (candidate: NominationCandidate, listType: 'primary' | 'backlog') => {
    setBusy(candidate.athleteId);
    try {
      await addNominationEntry(clubId!, nominationId!, candidate, listType, user!.id);
      setShowAddPicker(null);
    } catch (err) {
      console.error('NominationDetail: add failed', err);
      alert(t('nominations.errors.addFailed'));
    } finally {
      setBusy(null);
    }
  };

  const handleAddManual = async (listType: 'primary' | 'backlog') => {
    if (!manualName.trim()) return;
    const candidate = createManualCandidate(manualName);
    setManualName('');
    await handleAdd(candidate, listType);
  };

  const handleRemove = async (athleteId: string) => {
    setBusy(athleteId);
    try {
      await removeNominationEntry(clubId!, nominationId!, athleteId);
    } catch (err) {
      console.error('NominationDetail: remove failed', err);
    } finally {
      setBusy(null);
    }
  };

  const handlePromote = async () => {
    setBusy('__promote__');
    try {
      const name = await promoteNextFromBacklog(clubId!, nominationId!, user!.id);
      if (!name) alert(t('nominations.backlogEmpty'));
    } catch (err) {
      console.error('NominationDetail: promote failed', err);
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('nominations.confirmDelete'))) return;
    setBusy('__delete__');
    try {
      await deleteNomination(clubId!, nominationId!);
      navigate(`/clubs/${clubId}/teams/${nomination.teamId}?tab=nominations`);
    } catch (err) {
      console.error('NominationDetail: delete failed', err);
      setBusy(null);
    }
  };

  const startEditDetails = () => {
    setEditTitle(nomination.title);
    setEditDeadline(toDateTimeLocal(nomination.deadline));
    setEditingDetails(true);
  };

  const saveDetails = async () => {
    setBusy('__details__');
    try {
      await updateNominationDetails(clubId!, nominationId!, {
        title: editTitle.trim() || nomination.title,
        deadline: new Date(editDeadline), // Firestore SDK converts Date → Timestamp on write
      });
      setEditingDetails(false);
    } catch (err) {
      console.error('NominationDetail: save details failed', err);
    } finally {
      setBusy(null);
    }
  };

  const statusBadge = (status: NominationEntry['status']) => {
    if (status === 'confirmed') return <span className="text-[10px] font-semibold text-chart-cyan">✓ {t('nominations.status.confirmed')}</span>;
    if (status === 'declined') return <span className="text-[10px] font-semibold text-chart-pink">✗ {t('nominations.status.declined')}</span>;
    return <span className="text-[10px] font-semibold text-text-muted">{t('nominations.status.pending')}</span>;
  };

  const EntryRow = ({ entry, listType }: { entry: NominationEntry; listType: 'primary' | 'backlog' }) => (
    <div className="flex items-center gap-2 p-2 bg-app-secondary rounded-lg border border-white/10">
      <span className="flex-1 text-sm text-text-primary truncate">
        {entry.displayName}
        {entry.isManual && <span className="ml-1.5 text-[9px] font-semibold text-text-muted align-middle">({t('nominations.manual')})</span>}
      </span>
      {statusBadge(entry.status)}
      {isStaff && (
        <button
          onClick={() => handleRemove(entry.athleteId)}
          disabled={busy === entry.athleteId}
          className="flex-shrink-0 p-1 rounded text-text-muted hover:text-chart-pink transition-colors disabled:opacity-50"
          title={t('common.remove')}
        >
          ✕
        </button>
      )}
      {isStaff && listType === 'primary' && entry.status === 'declined' && (
        <button
          onClick={handlePromote}
          disabled={busy === '__promote__' || backlogList.length === 0}
          className="flex-shrink-0 px-2 py-1 text-[10px] font-semibold rounded bg-chart-purple/20 text-chart-purple border border-chart-purple/30 hover:bg-chart-purple/30 disabled:opacity-40 transition-colors"
        >
          {t('nominations.promoteNext')}
        </button>
      )}
    </div>
  );

  return (
    <Container>
      <div className="py-6 max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {editingDetails ? (
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full px-2 py-1 text-lg font-bold bg-app-secondary border border-white/10 rounded-lg text-text-primary mb-1"
                />
              ) : (
                <h1 className="text-lg font-bold text-text-primary truncate">{nomination.title}</h1>
              )}
              <p className="text-xs text-text-muted mt-0.5">{gameSummary}</p>
            </div>
            {isStaff && !editingDetails && (
              <div className="flex gap-1.5 flex-shrink-0">
                <button onClick={startEditDetails} className="px-2 py-1 text-[10px] bg-app-secondary border border-white/10 text-text-primary rounded hover:bg-white/10 transition-all">
                  {t('common.edit')}
                </button>
                <button onClick={handleDelete} disabled={busy === '__delete__'} className="px-2 py-1 text-[10px] bg-chart-pink/20 border border-chart-pink/30 text-chart-pink rounded hover:bg-chart-pink/30 transition-all disabled:opacity-50">
                  {t('common.delete')}
                </button>
              </div>
            )}
          </div>

          {editingDetails ? (
            <div className="mt-3 space-y-2">
              <label className="block text-xs font-semibold text-text-secondary">{t('nominations.deadline')}</label>
              <input
                type="datetime-local"
                value={editDeadline}
                onChange={e => setEditDeadline(e.target.value)}
                className="w-full px-2.5 py-2 text-sm bg-app-secondary border border-white/10 rounded-xl text-text-primary"
              />
              <div className="flex gap-2 pt-1">
                <button onClick={saveDetails} disabled={busy === '__details__'} className="flex-1 px-3 py-1.5 text-xs bg-gradient-primary text-white rounded-lg font-semibold disabled:opacity-50">
                  {t('common.save')}
                </button>
                <button onClick={() => setEditingDetails(false)} className="px-3 py-1.5 text-xs bg-app-secondary border border-white/10 text-text-primary rounded-lg">
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2 text-xs">
              <span className="text-text-muted">{t('nominations.deadline')}:</span>
              <span className={deadlinePassed ? 'text-chart-pink font-medium' : 'text-text-primary font-medium'}>
                {(typeof nomination.deadline === 'string' ? new Date(nomination.deadline) : nomination.deadline.toDate()).toLocaleString()}
              </span>
              {deadlinePassed && (
                <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-chart-pink/20 text-chart-pink">
                  {t('nominations.deadlinePassed')}
                </span>
              )}
            </div>
          )}
          {isStaff && deadlinePassed && (
            <p className="mt-1.5 text-[10px] text-text-muted">{t('nominations.editAnytimeHint')}</p>
          )}
        </div>

        {/* Recipient view — respond for my own athlete(s) */}
        {myEntries.length > 0 && (
          <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 space-y-3">
            <h2 className="text-sm font-bold text-text-primary">{t('nominations.yourNomination')}</h2>
            {myEntries.map(entry => (
              <div key={entry.athleteId} className="p-3 bg-app-secondary rounded-xl border border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-text-primary">{entry.displayName}</span>
                  {statusBadge(entry.status)}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRespond(entry.athleteId, 'confirmed')}
                    disabled={busy === entry.athleteId}
                    className={`flex-1 px-3 py-2 text-xs font-semibold rounded-lg transition-all disabled:opacity-50 ${
                      entry.status === 'confirmed' ? 'bg-chart-cyan text-white' : 'bg-chart-cyan/10 text-chart-cyan border border-chart-cyan/30 hover:bg-chart-cyan/20'
                    }`}
                  >
                    ✓ {t('nominations.confirm')}
                  </button>
                  <button
                    onClick={() => handleRespond(entry.athleteId, 'declined')}
                    disabled={busy === entry.athleteId}
                    className={`flex-1 px-3 py-2 text-xs font-semibold rounded-lg transition-all disabled:opacity-50 ${
                      entry.status === 'declined' ? 'bg-chart-pink text-white' : 'bg-chart-pink/10 text-chart-pink border border-chart-pink/30 hover:bg-chart-pink/20'
                    }`}
                  >
                    ✗ {t('nominations.decline')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Staff roster management */}
        {isStaff && (
          <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 space-y-4">
            {/* Primary */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-text-primary">
                  {t('nominations.primaryLabel')} ({primaryList.length}/{nomination.primarySize})
                </h2>
                <button
                  onClick={() => {
                    const next = showAddPicker === 'primary' ? null : 'primary';
                    setShowAddPicker(next);
                    setPickerSearch('');
                    setManualName('');
                  }}
                  className="text-xs font-semibold text-app-cyan hover:text-app-cyan/80"
                >
                  + {t('common.add')}
                </button>
              </div>
              {primaryList.length === 0 ? (
                <p className="text-xs text-text-muted py-1">{t('nominations.noPrimary')}</p>
              ) : (
                <div className="space-y-1.5">
                  {primaryList.map(entry => <EntryRow key={entry.athleteId} entry={entry} listType="primary" />)}
                </div>
              )}
              {showAddPicker === 'primary' && (
                <div className="mt-2 space-y-2 border-t border-white/10 pt-2">
                  <input
                    type="text"
                    value={pickerSearch}
                    onChange={e => setPickerSearch(e.target.value)}
                    placeholder={t('nominations.searchPlaceholder')}
                    className="w-full px-2.5 py-1.5 text-xs bg-app-card border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-app-blue"
                  />
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={manualName}
                      onChange={e => setManualName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddManual('primary'); } }}
                      placeholder={t('nominations.manualNamePlaceholder')}
                      className="flex-1 px-2.5 py-1.5 text-xs bg-app-card border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-app-blue"
                    />
                    <button
                      onClick={() => handleAddManual('primary')}
                      disabled={!manualName.trim()}
                      className="px-2.5 py-1.5 text-[10px] font-semibold bg-app-card border border-white/10 text-app-cyan rounded-lg hover:bg-white/10 disabled:opacity-40 transition-colors"
                    >
                      {t('nominations.addManual')}
                    </button>
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {availableCandidates.length === 0 ? (
                      <p className="text-xs text-text-muted">{t('nominations.noCandidates')}</p>
                    ) : availableCandidates.map(c => (
                      <button
                        key={c.athleteId}
                        onClick={() => handleAdd(c, 'primary')}
                        disabled={busy === c.athleteId}
                        className="w-full text-left px-2.5 py-1.5 text-xs bg-app-secondary rounded-lg hover:bg-white/10 text-text-primary transition-colors disabled:opacity-50"
                      >
                        {c.displayName}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Backlog */}
            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-text-primary">{t('nominations.backlogLabel')} ({backlogList.length})</h2>
                <button
                  onClick={() => {
                    const next = showAddPicker === 'backlog' ? null : 'backlog';
                    setShowAddPicker(next);
                    setPickerSearch('');
                    setManualName('');
                  }}
                  className="text-xs font-semibold text-app-cyan hover:text-app-cyan/80"
                >
                  + {t('common.add')}
                </button>
              </div>
              {backlogList.length === 0 ? (
                <p className="text-xs text-text-muted py-1">{t('nominations.noBacklog')}</p>
              ) : (
                <div className="space-y-1.5">
                  {backlogList.map(entry => <EntryRow key={entry.athleteId} entry={entry} listType="backlog" />)}
                </div>
              )}
              {showAddPicker === 'backlog' && (
                <div className="mt-2 space-y-2 border-t border-white/10 pt-2">
                  <input
                    type="text"
                    value={pickerSearch}
                    onChange={e => setPickerSearch(e.target.value)}
                    placeholder={t('nominations.searchPlaceholder')}
                    className="w-full px-2.5 py-1.5 text-xs bg-app-card border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-app-blue"
                  />
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={manualName}
                      onChange={e => setManualName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddManual('backlog'); } }}
                      placeholder={t('nominations.manualNamePlaceholder')}
                      className="flex-1 px-2.5 py-1.5 text-xs bg-app-card border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-app-blue"
                    />
                    <button
                      onClick={() => handleAddManual('backlog')}
                      disabled={!manualName.trim()}
                      className="px-2.5 py-1.5 text-[10px] font-semibold bg-app-card border border-white/10 text-app-cyan rounded-lg hover:bg-white/10 disabled:opacity-40 transition-colors"
                    >
                      {t('nominations.addManual')}
                    </button>
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {availableCandidates.length === 0 ? (
                      <p className="text-xs text-text-muted">{t('nominations.noCandidates')}</p>
                    ) : availableCandidates.map(c => (
                      <button
                        key={c.athleteId}
                        onClick={() => handleAdd(c, 'backlog')}
                        disabled={busy === c.athleteId}
                        className="w-full text-left px-2.5 py-1.5 text-xs bg-app-secondary rounded-lg hover:bg-white/10 text-text-primary transition-colors disabled:opacity-50"
                      >
                        {c.displayName}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <Link
          to={`/clubs/${clubId}/teams/${nomination.teamId}?tab=nominations`}
          className="inline-flex items-center gap-1.5 text-xs text-app-cyan hover:text-app-cyan/80 transition-colors"
        >
          ← {t('nominations.backToList')}
        </Link>
      </div>
    </Container>
  );
}
