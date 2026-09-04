/**
 * Quick Ask response/results page — reached either by tapping the push
 * notification (data.actionUrl, see NotificationManager.onQuickAskCreated)
 * or from the banner/button on TeamView. Anyone on the team can answer
 * Yes/No/Maybe in one tap; the creator additionally sees a live breakdown
 * by name and can close/reopen/delete it.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { subscribeToQuickAsk, respondToQuickAsk, setQuickAskStatus, deleteQuickAsk } from '../../services/firebase/quickAsks';
import { getTeam, getTeamMembers } from '../../services/firebase/teams';
import { db } from '../../config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { QuickAsk, QuickAskChoice } from '../../types';

const CHOICES: QuickAskChoice[] = ['yes', 'no', 'maybe'];

export default function QuickAskView() {
  const { clubId, teamId, quickAskId } = useParams<{ clubId: string; teamId: string; quickAskId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [quickAsk, setQuickAsk] = useState<QuickAsk | null | undefined>(undefined);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [responding, setResponding] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!clubId || !quickAskId) return;
    const unsub = subscribeToQuickAsk(clubId, quickAskId, setQuickAsk);
    return unsub;
  }, [clubId, quickAskId]);

  // Names for the responder breakdown + non-responders list (creator only).
  useEffect(() => {
    if (!clubId || !teamId) return;
    (async () => {
      const team = await getTeam(clubId, teamId);
      if (!team) return;
      const memberIds = Object.keys(getTeamMembers(team));
      const entries = await Promise.all(
        memberIds.map(async (id) => {
          const snap = await getDoc(doc(db, 'users', id));
          return [id, snap.exists() ? (snap.data().displayName as string) : id] as const;
        })
      );
      setMemberNames(Object.fromEntries(entries));
    })();
  }, [clubId, teamId]);

  if (quickAsk === undefined) {
    return (
      <Container>
        <div className="text-center text-text-muted py-10 text-sm">{t('common.loading')}</div>
      </Container>
    );
  }

  if (quickAsk === null || !clubId || !teamId || !quickAskId) {
    return (
      <Container>
        <div className="bg-app-card border border-white/10 rounded-xl p-6 text-center">
          <p className="text-text-secondary text-sm">{t('quickAsk.notFound')}</p>
        </div>
      </Container>
    );
  }

  const isCreator = user?.id === quickAsk.createdBy;
  const myResponse = user ? quickAsk.responses[user.id] : undefined;
  const isClosed = quickAsk.status === 'closed';

  const tally = CHOICES.reduce<Record<QuickAskChoice, number>>((acc, c) => {
    acc[c] = 0;
    return acc;
  }, { yes: 0, no: 0, maybe: 0 });
  Object.values(quickAsk.responses).forEach(r => { tally[r.choice]++; });

  const respondedIds = new Set(Object.keys(quickAsk.responses));
  const notResponded = Object.keys(memberNames).filter(id => !respondedIds.has(id));

  const handleRespond = async (choice: QuickAskChoice) => {
    if (!user || isClosed) return;
    setResponding(true);
    try {
      await respondToQuickAsk(clubId, quickAskId, user.id, choice);
    } catch (err) {
      console.error('Failed to submit quick ask response:', err);
    } finally {
      setResponding(false);
    }
  };

  const handleToggleStatus = async () => {
    setBusy(true);
    try {
      await setQuickAskStatus(clubId, quickAskId, isClosed ? 'open' : 'closed');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('quickAsk.confirmDelete'))) return;
    setBusy(true);
    try {
      await deleteQuickAsk(clubId, quickAskId);
      navigate(`/clubs/${clubId}/teams/${teamId}`);
    } finally {
      setBusy(false);
    }
  };

  const CHOICE_STYLES: Record<QuickAskChoice, string> = {
    yes: 'bg-green-500/15 border-green-500/40 text-green-400',
    no: 'bg-red-500/15 border-red-500/40 text-red-400',
    maybe: 'bg-amber-500/15 border-amber-500/40 text-amber-400',
  };

  return (
    <Container>
      <div className="space-y-3 max-w-xl mx-auto">
        <div className="bg-app-card shadow-card rounded-xl border border-white/10 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase font-semibold tracking-wide text-text-muted">
              {t('quickAsk.askedBy', { name: quickAsk.creatorName })}
            </span>
            <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${isClosed ? 'bg-white/10 text-text-muted' : 'bg-app-cyan/15 text-app-cyan'}`}>
              {isClosed ? t('quickAsk.statusClosed') : t('quickAsk.statusOpen')}
            </span>
          </div>

          <h1 className="text-lg sm:text-xl font-bold text-text-primary break-words">
            {quickAsk.question}
          </h1>

          {isClosed && (
            <p className="text-xs text-text-muted bg-white/5 rounded-lg p-2.5">{t('quickAsk.closedNotice')}</p>
          )}

          {/* Respond */}
          <div className="grid grid-cols-3 gap-2">
            {CHOICES.map(choice => (
              <button
                key={choice}
                disabled={isClosed || responding}
                onClick={() => handleRespond(choice)}
                className={`py-3 rounded-xl border text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  myResponse?.choice === choice
                    ? CHOICE_STYLES[choice] + ' ring-2 ring-offset-0'
                    : 'bg-app-secondary border-white/10 text-text-secondary hover:bg-white/10'
                }`}
              >
                {t(`quickAsk.${choice}`)}
              </button>
            ))}
          </div>
          {myResponse && !isClosed && (
            <p className="text-[11px] text-text-muted text-center">{t('quickAsk.changeAnswer')}</p>
          )}

          {/* Tally */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            {CHOICES.map(choice => (
              <div key={choice} className="bg-app-secondary rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-text-primary">{tally[choice]}</div>
                <div className="text-[9px] uppercase font-semibold text-text-muted">{t(`quickAsk.tally${choice.charAt(0).toUpperCase()}${choice.slice(1)}`)}</div>
              </div>
            ))}
          </div>
        </div>

        {isCreator && (
          <div className="bg-app-card shadow-card rounded-xl border border-white/10 p-4 space-y-3">
            <h2 className="text-sm font-bold text-text-primary">{t('quickAsk.responses')}</h2>

            {Object.keys(quickAsk.responses).length === 0 ? (
              <p className="text-xs text-text-muted">{t('quickAsk.noResponsesYet')}</p>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(quickAsk.responses)
                  .sort((a, b) => (memberNames[a[0]] || '').localeCompare(memberNames[b[0]] || ''))
                  .map(([uid, r]) => (
                    <div key={uid} className="flex items-center justify-between text-xs bg-app-secondary rounded-lg px-2.5 py-1.5">
                      <span className="text-text-primary truncate">{memberNames[uid] || uid}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${CHOICE_STYLES[r.choice]}`}>
                        {t(`quickAsk.${r.choice}`)}
                      </span>
                    </div>
                  ))}
              </div>
            )}

            {notResponded.length > 0 ? (
              <div className="pt-1">
                <div className="text-[10px] uppercase font-semibold text-text-muted mb-1">{t('quickAsk.notResponded')}</div>
                <div className="flex flex-wrap gap-1.5">
                  {notResponded.map(id => (
                    <span key={id} className="text-[11px] text-text-muted bg-white/5 rounded-full px-2 py-0.5">
                      {memberNames[id] || id}
                    </span>
                  ))}
                </div>
              </div>
            ) : Object.keys(memberNames).length > 0 && (
              <p className="text-[11px] text-app-cyan">{t('quickAsk.everyoneResponded')}</p>
            )}

            <div className="flex gap-2 pt-2 border-t border-white/5">
              <button
                onClick={handleToggleStatus}
                disabled={busy}
                className="flex-1 px-3 py-2 bg-app-secondary border border-white/10 text-text-primary rounded-lg hover:bg-white/10 transition-all text-xs font-medium disabled:opacity-50"
              >
                {isClosed ? t('quickAsk.reopen') : t('quickAsk.close')}
              </button>
              <button
                onClick={handleDelete}
                disabled={busy}
                className="px-3 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/20 transition-all text-xs font-medium disabled:opacity-50"
              >
                {t('quickAsk.delete')}
              </button>
            </div>
          </div>
        )}
      </div>
    </Container>
  );
}
