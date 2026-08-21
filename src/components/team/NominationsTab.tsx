import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { getTeamNominations, isNominationDeadlinePassed } from '../../services/firebase/nominations';
import type { Nomination } from '../../types';

interface Props {
  clubId: string;
  teamId: string;
  canManage: boolean; // trainer / assistant of this club OR club owner
}

export default function NominationsTab({ clubId, teamId, canManage }: Props) {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [nominations, setNominations] = useState<Nomination[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [clubId, teamId]);

  const load = async () => {
    setLoading(true);
    try {
      setNominations(await getTeamNominations(clubId, teamId));
    } catch (err) {
      console.error('NominationsTab: load failed', err);
    } finally {
      setLoading(false);
    }
  };

  const gameSummary = (n: Nomination) =>
    n.games.map(g => `${g.date}${g.opponent ? ' vs ' + g.opponent : ''}`).join(' · ');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm sm:text-base font-bold text-text-primary">{t('nominations.tabLabel')}</h2>
        {canManage && (
          <button
            onClick={() => navigate(`/clubs/${clubId}/teams/${teamId}/nominations/new`)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] sm:text-xs bg-app-blue/20 text-app-cyan border border-app-cyan/20 rounded-lg hover:bg-app-blue/40 transition-colors font-medium"
          >
            + {t('nominations.create')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-app-cyan" />
        </div>
      ) : nominations.length === 0 ? (
        <div className="text-center py-10 space-y-1">
          <div className="text-2xl">📋</div>
          <p className="text-xs text-text-secondary">{t('nominations.noneYet')}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {nominations.map(n => {
            const primaryCount = Object.keys(n.primary).length;
            const confirmedCount = Object.values(n.primary).filter(e => e.status === 'confirmed').length;
            const deadlinePassed = isNominationDeadlinePassed(n);
            return (
              <button
                key={n.id}
                onClick={() => navigate(`/clubs/${clubId}/nominations/${n.id}`)}
                className="w-full text-left flex items-center gap-2 p-2.5 bg-app-secondary border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-text-primary truncate">{n.title}</div>
                  <div className="text-[10px] text-text-muted truncate">{gameSummary(n)}</div>
                </div>
                <div className="flex-shrink-0 text-[10px] text-text-secondary">
                  {confirmedCount}/{primaryCount}
                </div>
                {deadlinePassed && (
                  <span className="flex-shrink-0 px-1.5 py-0.5 text-[9px] font-semibold rounded bg-chart-pink/20 text-chart-pink">
                    {t('nominations.deadlinePassed')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
