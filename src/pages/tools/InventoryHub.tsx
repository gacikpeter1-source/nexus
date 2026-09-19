/**
 * Inventory Tool Hub — staff pick a club (and optionally a team) to see its
 * inventories, or create a new one. Mirrors LineupHub/TrainingTimerHub's
 * club/team filter pattern.
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { getUserClubs } from '../../services/firebase/clubs';
import { getClubInventories } from '../../services/firebase/inventory';
import type { Club, Inventory } from '../../types';

const STAFF_ROLES = ['clubOwner', 'trainer', 'assistant', 'admin'];

export default function InventoryHub() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const isStaff = !!user && (STAFF_ROLES.includes(user.role) || user.isSuperAdmin);

  const [clubs, setClubs] = useState<Club[]>([]);
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [clubFilter, setClubFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');

  useEffect(() => {
    if (!user || !isStaff) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isStaff]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const userClubs = await getUserClubs(user.id);
      setClubs(userClubs);
      if (userClubs.length === 1) setClubFilter(userClubs[0].id!);
      const lists = await Promise.all(userClubs.map(c => getClubInventories(c.id!).catch(() => [])));
      setInventories(lists.flat());
    } catch (err) {
      console.error('InventoryHub: load failed', err);
    } finally {
      setLoading(false);
    }
  };

  const clubById = useMemo(() => new Map(clubs.map(c => [c.id!, c])), [clubs]);

  const teamsForFilter = useMemo(() => {
    if (clubFilter) return clubById.get(clubFilter)?.teams || [];
    return clubs.flatMap(c => c.teams || []);
  }, [clubFilter, clubById, clubs]);

  useEffect(() => {
    if (teamFilter && !teamsForFilter.some(tm => tm.id === teamFilter)) {
      setTeamFilter('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubFilter]);

  const filteredInventories = inventories.filter(inv =>
    (!clubFilter || inv.clubId === clubFilter) &&
    (!teamFilter || inv.teamId === teamFilter)
  );

  const showClubName = clubs.length > 1 && !clubFilter;

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

  return (
    <Container>
      <div className="py-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-text-primary">📦 {t('inventory.title')}</h1>
            <p className="text-xs text-text-secondary mt-0.5">{t('inventory.hubSubtitle')}</p>
          </div>
          {clubFilter && (
            <Link
              to={`/tools/inventory/new?clubId=${clubFilter}${teamFilter ? `&teamId=${teamFilter}` : ''}`}
              className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold bg-gradient-primary text-white rounded-lg shadow-button"
            >
              + {t('inventory.newInventory')}
            </Link>
          )}
        </div>

        {clubs.length > 1 && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-text-muted mb-1">{t('lineup.filterClub')}</label>
              <select
                value={clubFilter}
                onChange={(e) => setClubFilter(e.target.value)}
                className="w-full px-3 py-2 bg-app-card border border-white/10 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-app-blue"
              >
                <option value="">{t('lineup.allClubs')}</option>
                {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-text-muted mb-1">{t('lineup.filterTeam')}</label>
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                disabled={teamsForFilter.length === 0}
                className="w-full px-3 py-2 bg-app-card border border-white/10 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-app-blue disabled:opacity-50"
              >
                <option value="">{t('lineup.allTeams')}</option>
                {teamsForFilter.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
              </select>
            </div>
          </div>
        )}

        {!clubFilter && clubs.length !== 1 && (
          <p className="text-xs text-text-muted text-center py-2">{t('inventory.pickClubToCreate')}</p>
        )}

        {loading ? (
          <div className="text-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-cyan mx-auto"></div>
          </div>
        ) : filteredInventories.length === 0 ? (
          <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-6 text-center text-sm text-text-secondary">
            {inventories.length === 0 ? t('inventory.hubEmpty') : t('inventory.hubEmptyFiltered')}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredInventories.map(inv => {
              const club = clubById.get(inv.clubId);
              const team = club?.teams?.find(tm => tm.id === inv.teamId);
              return (
                <Link
                  key={inv.id}
                  to={`/tools/inventory/${inv.id}`}
                  className="block bg-app-card rounded-xl shadow-card border border-white/10 p-3 hover:border-app-cyan/40 hover:-translate-y-0.5 transition-all duration-300"
                >
                  <p className="text-sm font-semibold text-text-primary truncate">{inv.name}</p>
                  <p className="text-[11px] text-text-muted mt-0.5 truncate">
                    {team ? team.name : t('inventory.clubWide')}
                    {showClubName && club && ` · ${club.name}`}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Container>
  );
}
