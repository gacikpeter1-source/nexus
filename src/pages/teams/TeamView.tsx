/**
 * Team View Page
 * Full page view with tabs: overview|league|chat|members|trainers|attend|stats
 * Mobile-first, dark theme design
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import Container from '../../components/layout/Container';
import { doc, getDoc, updateDoc, collection, getDocs, query, where, orderBy, limit as firestoreLimit } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Team, Club, User, Event } from '../../types';
import TeamQRCode from '../../components/team/TeamQRCode';
import TeamInviteCodes from '../../components/team/TeamInviteCodes';
import TeamChat from '../../components/chat/TeamChat';
import AttendTab from '../../components/team/AttendTab';

export default function TeamView() {
  const { clubId, teamId } = useParams<{ clubId: string; teamId: string }>();
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [team, setTeam] = useState<Team | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [trainers, setTrainers] = useState<User[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'league' | 'chat' | 'members' | 'trainers' | 'attend' | 'stats'>('overview');
  const [showQRCode, setShowQRCode] = useState(false);
  const [showInviteCodes, setShowInviteCodes] = useState(false);
  const [updatingRoleFor, setUpdatingRoleFor] = useState<string | null>(null);

  useEffect(() => {
    if (clubId && teamId) {
      loadTeamData();
    }
  }, [clubId, teamId]);

  const loadTeamData = async () => {
    if (!clubId || !teamId) return;

    try {
      setLoading(true);

      // Load club first (teams are embedded in club document)
      const clubDoc = await getDoc(doc(db, 'clubs', clubId));
      if (!clubDoc.exists()) throw new Error('Club not found');
      
      const clubData = { id: clubDoc.id, ...clubDoc.data() } as Club;
      setClub(clubData);

      // Find team within club's teams array
      const teamData = clubData.teams?.find(t => t.id === teamId);
      if (!teamData) throw new Error('Team not found');
      setTeam(teamData)

      // Load members
      if (teamData.members && teamData.members.length > 0) {
        const membersPromises = teamData.members.map(async (memberId) => {
          const userDoc = await getDoc(doc(db, 'users', memberId));
          if (userDoc.exists()) {
            return { id: userDoc.id, ...userDoc.data() } as User;
          }
          return null;
        });
        const membersData = await Promise.all(membersPromises);
        setMembers(membersData.filter((m): m is User => m !== null));
      }

      // Load trainers
      if (teamData.trainers && teamData.trainers.length > 0) {
        const trainersPromises = teamData.trainers.map(async (trainerId) => {
          const userDoc = await getDoc(doc(db, 'users', trainerId));
          if (userDoc.exists()) {
            return { id: userDoc.id, ...userDoc.data() } as User;
          }
          return null;
        });
        const trainersData = await Promise.all(trainersPromises);
        setTrainers(trainersData.filter((t): t is User => t !== null));
      }

      // Load upcoming events for this team (including recurring series with past start dates)
      try {
        const today = new Date().toISOString().split('T')[0];
        const todayDate = new Date(today + 'T00:00:00');

        // Two parallel queries so recurring events with past start dates aren't missed
        const [upcomingSnap, recurringSnap] = await Promise.all([
          getDocs(query(
            collection(db, 'events'),
            where('clubId', '==', clubId),
            where('date', '>=', today),
            orderBy('date', 'asc'),
            firestoreLimit(50)
          )),
          getDocs(query(
            collection(db, 'events'),
            where('clubId', '==', clubId),
            where('isRecurring', '==', true),
            firestoreLimit(50)
          )),
        ]);

        // Merge by id (dedup), then filter by teamId
        const eventMap = new Map<string, Event>();
        for (const snap of [upcomingSnap, recurringSnap]) {
          for (const d of snap.docs) {
            eventMap.set(d.id, { id: d.id, ...d.data() } as Event);
          }
        }
        const baseEvents = Array.from(eventMap.values()).filter(e => e.teamId === teamId);

        // Expand recurring events up to 6 months ahead to guarantee finding 5
        const lookahead = new Date(todayDate);
        lookahead.setMonth(lookahead.getMonth() + 6);
        const toDateStr = (d: Date) => d.toISOString().split('T')[0];

        const expanded: Event[] = [];
        for (const event of baseEvents) {
          const exceptions = event.exceptions || [];

          // Base occurrence: include if on or after today
          if (event.date >= today && !exceptions.includes(event.date)) {
            expanded.push(event);
          }

          if (!event.isRecurring || !event.recurrenceRule) continue;

          const rule = event.recurrenceRule;
          const maxDate = rule.endDate
            ? new Date(Math.min(new Date(rule.endDate + 'T00:00:00').getTime(), lookahead.getTime()))
            : lookahead;
          const maxCount = rule.count ?? Infinity;
          let occurrenceCount = 1;

          const cur = new Date(event.date + 'T00:00:00');

          if (rule.frequency === 'weekly' && rule.daysOfWeek && rule.daysOfWeek.length > 0) {
            // Step day by day and only count matching weekdays
            cur.setDate(cur.getDate() + 1);
            while (cur <= maxDate && occurrenceCount < maxCount) {
              if (rule.daysOfWeek.includes(cur.getDay())) {
                const ds = toDateStr(cur);
                if (cur >= todayDate && !exceptions.includes(ds)) {
                  expanded.push({ ...event, date: ds });
                }
                occurrenceCount++;
              }
              cur.setDate(cur.getDate() + 1);
            }
          } else {
            // daily / monthly / weekly without specific days
            const advance = () => {
              switch (rule.frequency) {
                case 'daily': cur.setDate(cur.getDate() + rule.interval); break;
                case 'weekly': cur.setDate(cur.getDate() + 7 * rule.interval); break;
                case 'monthly': cur.setMonth(cur.getMonth() + rule.interval); break;
              }
            };
            advance();
            while (cur <= maxDate && occurrenceCount < maxCount) {
              const ds = toDateStr(cur);
              if (cur >= todayDate && !exceptions.includes(ds)) {
                expanded.push({ ...event, date: ds });
              }
              occurrenceCount++;
              advance();
            }
          }
        }

        expanded.sort((a, b) => {
          const dc = a.date.localeCompare(b.date);
          return dc !== 0 ? dc : (a.startTime || '').localeCompare(b.startTime || '');
        });

        setEvents(expanded.slice(0, 5));
      } catch (error) {
        console.error('❌ Error loading events:', error);
        setEvents([]);
      }

    } catch (error) {
      console.error('Error loading team data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleRole = async (memberId: string, currentRole: string, targetRole: 'parent' | 'assistant') => {
    const newRole = currentRole === targetRole ? 'user' : targetRole;
    setUpdatingRoleFor(memberId);
    try {
      await updateDoc(doc(db, 'users', memberId), {
        role: newRole,
        updatedAt: new Date().toISOString(),
      });
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole as any } : m));
    } catch (err) {
      console.error('Error toggling role:', err);
    } finally {
      setUpdatingRoleFor(null);
    }
  };

  if (loading) {
    return (
      <Container>
        <div className="text-center py-8 sm:py-12">
          <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-app-cyan mx-auto mb-3 sm:mb-4"></div>
          <p className="text-xs sm:text-sm text-text-secondary">{t('common.loading')}</p>
        </div>
      </Container>
    );
  }

  if (!team || !club) {
    return (
      <Container>
        <div className="text-center py-8 sm:py-12">
          <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-text-primary mb-3 sm:mb-4">
            Team Not Found
          </h2>
          <p className="text-xs sm:text-sm text-text-secondary mb-4 sm:mb-6">
            The team you're looking for doesn't exist or you don't have access.
          </p>
          <button
            onClick={() => navigate(`/clubs/${clubId}`)}
            className="px-4 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm bg-gradient-primary text-white rounded-lg shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold"
          >
            Back to Club
          </button>
        </div>
      </Container>
    );
  }

  const isTrainer = !!(user && team.trainers?.includes(user.id));
  const isAssistant = !!(user && team.assistants?.includes(user.id));
  const canManage = isTrainer || isAssistant;
  const isClubOwner = !!(user && club.ownerId === user.id);
  const canAssignAssistant = isTrainer || isClubOwner;
  const isClubTrainer = user && club.trainers?.includes(user.id);
  const canGenerateQR = isClubOwner || isClubTrainer || isTrainer;

  return (
    <Container>
      <div className="space-y-2 sm:space-y-3">
        {/* Header - Compact */}
        <div className="bg-app-card shadow-card rounded-xl border border-white/10 p-2.5 sm:p-3">
          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-1.5 text-[10px] sm:text-xs mb-2 flex-wrap">
            <button
              onClick={() => navigate('/')}
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              {t('nav.dashboard')}
            </button>
            <svg className="w-3 h-3 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <button
              onClick={() => navigate(`/clubs/${clubId}/teams`)}
              className="text-text-muted hover:text-text-primary transition-colors truncate"
            >
              {club.name}
            </button>
            <svg className="w-3 h-3 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-app-cyan font-medium truncate">{team.name}</span>
          </div>

          {/* Team Info */}
          <div className="flex items-center gap-2">
            {team.logoURL ? (
              <img
                src={team.logoURL}
                alt={team.name}
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl object-cover border-2 border-white/10 flex-shrink-0"
              />
            ) : (
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-primary flex items-center justify-center text-white text-base sm:text-xl font-bold flex-shrink-0">
                {team.name.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h1 className="text-base sm:text-lg md:text-xl font-bold text-text-primary break-words">
                {team.name}
              </h1>
              {team.category && (
                <p className="text-[10px] sm:text-xs text-app-cyan font-medium">
                  {team.category}
                </p>
              )}
            </div>

            {/* Action Buttons */}
            {canGenerateQR && (
              <div className="flex items-center gap-2">
                {/* Invite Code Button */}
                <button
                  onClick={() => setShowInviteCodes(true)}
                  className="px-3 py-2 bg-app-secondary border border-white/10 text-text-primary rounded-lg hover:bg-white/10 transition-all flex items-center gap-2 text-xs"
                  title="Manage Invite Codes"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  <span className="hidden sm:inline">Invite Code</span>
                </button>

                {/* QR Code Button */}
                <button
                  onClick={() => setShowQRCode(true)}
                  className="px-3 py-2 bg-app-secondary border border-white/10 text-text-primary rounded-lg hover:bg-white/10 transition-all flex items-center gap-2 text-xs"
                  title="Generate QR Code"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                  <span className="hidden sm:inline">QR Code</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Stats Cards - Compact */}
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
          <div className="bg-app-card border border-white/10 rounded-lg p-2 sm:p-2.5">
            <div className="text-base sm:text-lg md:text-xl font-bold text-text-primary">
              {trainers.length}
            </div>
            <div className="text-[9px] sm:text-[10px] text-text-muted uppercase font-semibold">
              Trainers
            </div>
          </div>
          <div className="bg-app-card border border-white/10 rounded-lg p-2 sm:p-2.5">
            <div className="text-base sm:text-lg md:text-xl font-bold text-text-primary">
              {team.assistants?.length || 0}
            </div>
            <div className="text-[9px] sm:text-[10px] text-text-muted uppercase font-semibold">
              Assistants
            </div>
          </div>
          <div className="bg-app-card border border-white/10 rounded-lg p-2 sm:p-2.5">
            <div className="text-base sm:text-lg md:text-xl font-bold text-text-primary">
              {members.length}
            </div>
            <div className="text-[9px] sm:text-[10px] text-text-muted uppercase font-semibold">
              Members
            </div>
          </div>
          <div className="bg-app-card border border-white/10 rounded-lg p-2 sm:p-2.5">
            <div className="text-base sm:text-lg md:text-xl font-bold text-text-primary">
              {events.length}
            </div>
            <div className="text-[9px] sm:text-[10px] text-text-muted uppercase font-semibold">
              Events
            </div>
          </div>
        </div>

        {/* Tabs - Compact, Mobile-First */}
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
          {(['overview', 'league', 'chat', 'members', 'trainers', 'attend', 'stats'] as const)
            .filter(tab => tab !== 'attend' || canManage || isClubOwner)
            .map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-2 sm:px-2.5 py-1 sm:py-1.5 text-[9px] sm:text-[10px] md:text-xs font-medium rounded-lg whitespace-nowrap transition-all flex-shrink-0 ${
                activeTab === tab
                  ? 'bg-app-blue text-white shadow-button'
                  : 'bg-app-secondary text-text-secondary hover:bg-white/10'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-app-card shadow-card rounded-xl border border-white/10 p-2.5 sm:p-3">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-3 sm:space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-sm sm:text-base md:text-lg font-bold text-text-primary">
                  Upcoming Events
                </h2>
                <button
                  onClick={() => navigate('/calendar')}
                  className="text-[10px] sm:text-xs text-app-cyan hover:underline font-medium"
                >
                  View All
                </button>
              </div>

              {events.length > 0 ? (
                <div className="space-y-1.5 sm:space-y-2">
                  {events.map((event) => {
                    // Format date
                    const eventDate = new Date(event.date + 'T00:00:00');
                    const dateStr = eventDate.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: eventDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
                    });
                    
                    return (
                      <div
                        key={event.id}
                        onClick={() => navigate(`/calendar/events/${event.id}?${event.isRecurring ? `date=${event.date}&` : ''}from=team&clubId=${clubId}&teamId=${teamId}`)}
                        className="flex items-start gap-2 p-2 sm:p-2.5 bg-app-secondary border border-white/10 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-xs sm:text-sm font-semibold text-text-primary truncate">
                            {event.title}
                          </div>
                          <div className="text-[10px] sm:text-xs text-text-muted mt-0.5">
                            {dateStr} {event.startTime && `• ${event.startTime}`}
                            {event.location && ` • ${event.location}`}
                          </div>
                          {/* Show response count if available */}
                          {event.confirmedCount !== undefined && event.confirmedCount > 0 && (
                            <div className="text-[10px] text-chart-cyan mt-0.5">
                              ✓ {event.confirmedCount} confirmed
                            </div>
                          )}
                        </div>
                        <span className={`px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold rounded-full whitespace-nowrap flex-shrink-0 ${
                          (event as any).category === 'practice'
                            ? 'bg-chart-blue/20 text-chart-blue'
                            : (event as any).category === 'game'
                            ? 'bg-chart-pink/20 text-chart-pink'
                            : (event as any).category === 'tournament'
                            ? 'bg-chart-purple/20 text-chart-purple'
                            : 'bg-app-secondary text-text-secondary'
                        }`}>
                          {(event as any).category || 'event'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6 sm:py-8">
                  <svg className="w-10 h-10 sm:w-12 sm:h-12 text-text-muted mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-xs sm:text-sm text-text-secondary mb-3">No upcoming events</p>
                  {canManage && (
                    <button
                      onClick={() => navigate(`/calendar/create?clubId=${clubId}&teamId=${teamId}`)}
                      className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm bg-gradient-primary text-white rounded-lg shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold"
                    >
                      Create Event
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* League Tab */}
          {activeTab === 'league' && (
            <div className="space-y-3 sm:space-y-4">
              <h2 className="text-sm sm:text-base md:text-lg font-bold text-text-primary">
                League Schedule
              </h2>
              <div className="text-center py-8 sm:py-12">
                <svg className="w-12 h-12 sm:w-16 sm:h-16 text-text-muted mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
                <p className="text-xs sm:text-sm font-semibold text-text-secondary mb-1">
                  League Feature Coming Soon
                </p>
                <p className="text-[10px] sm:text-xs text-text-muted">
                  Add matches manually or import from Excel/PDF
                </p>
              </div>
            </div>
          )}

          {/* Chat Tab */}
          {activeTab === 'chat' && team && clubId && teamId && (
            <div className="h-[calc(100vh-250px)] min-h-[400px]">
              <TeamChat
                clubId={clubId}
                teamId={teamId}
                team={team}
                isTrainer={isTrainer}
              />
            </div>
          )}

          {/* Members Tab */}
          {activeTab === 'members' && (
            <div className="space-y-3 sm:space-y-4">
              <h2 className="text-sm sm:text-base md:text-lg font-bold text-text-primary">
                Members ({members.length})
              </h2>
              {members.length > 0 ? (
                <div className="space-y-1.5 sm:space-y-2">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-2 p-2 sm:p-2.5 bg-app-secondary rounded-lg"
                    >
                      {member.photoURL ? (
                        <img
                          src={member.photoURL}
                          alt={member.displayName}
                          className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover border-2 border-text-muted flex-shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-primary flex items-center justify-center text-white text-xs sm:text-sm font-bold flex-shrink-0">
                          {member.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs sm:text-sm font-semibold text-text-primary truncate">
                          {member.displayName}
                        </div>
                        {canManage && (
                          <div className="text-[10px] sm:text-xs text-text-muted truncate">
                            {member.email}
                          </div>
                        )}
                      </div>

                      {/* Role toggles — only for user/parent/assistant, not for trainer+ */}
                      {canManage && ['user', 'parent', 'assistant'].includes(member.role) && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {/* Parent — canManage (trainer or assistant) */}
                          {(member.role === 'user' || member.role === 'parent') && (
                            <label className="flex items-center gap-1 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={member.role === 'parent'}
                                disabled={updatingRoleFor === member.id}
                                onChange={() => toggleRole(member.id, member.role, 'parent')}
                                className="w-3.5 h-3.5 accent-app-cyan"
                              />
                              <span className="text-[10px] text-text-muted">{t('roles.parent')}</span>
                            </label>
                          )}
                          {/* Assistant — trainer or club owner only */}
                          {canAssignAssistant && (member.role === 'user' || member.role === 'assistant') && (
                            <label className="flex items-center gap-1 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={member.role === 'assistant'}
                                disabled={updatingRoleFor === member.id}
                                onChange={() => toggleRole(member.id, member.role, 'assistant')}
                                className="w-3.5 h-3.5 accent-app-cyan"
                              />
                              <span className="text-[10px] text-text-muted">{t('roles.assistant')}</span>
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-xs sm:text-sm text-text-secondary py-6">
                  No members yet
                </p>
              )}
            </div>
          )}

          {/* Trainers Tab */}
          {activeTab === 'trainers' && (
            <div className="space-y-3 sm:space-y-4">
              <h2 className="text-sm sm:text-base md:text-lg font-bold text-text-primary">
                Trainers ({trainers.length})
              </h2>
              {trainers.length > 0 ? (
                <div className="space-y-1.5 sm:space-y-2">
                  {trainers.map((trainer) => (
                    <div
                      key={trainer.id}
                      className="flex items-center gap-2 p-2 sm:p-2.5 bg-app-secondary rounded-lg"
                    >
                      {trainer.photoURL ? (
                        <img
                          src={trainer.photoURL}
                          alt={trainer.displayName}
                          className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover border-2 border-app-blue flex-shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-primary flex items-center justify-center text-white text-xs sm:text-sm font-bold flex-shrink-0">
                          {trainer.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs sm:text-sm font-semibold text-text-primary truncate">
                          {trainer.displayName}
                        </div>
                        <div className="text-[10px] sm:text-xs text-text-muted truncate">
                          {trainer.email}
                        </div>
                        {trainer.phoneNumber && (
                          <div className="text-[10px] sm:text-xs text-text-muted truncate">
                            {trainer.phoneNumber}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-xs sm:text-sm text-text-secondary py-6">
                  No trainers assigned
                </p>
              )}
            </div>
          )}

          {/* Attend Tab — trainer / assistant / club owner only */}
          {activeTab === 'attend' && (canManage || isClubOwner) && clubId && teamId && (
            <AttendTab clubId={clubId} teamId={teamId} members={members} />
          )}

          {/* Stats Tab */}
          {activeTab === 'stats' && (
            <div className="space-y-3 sm:space-y-4">
              <h2 className="text-sm sm:text-base md:text-lg font-bold text-text-primary">
                Statistics
              </h2>
              <div className="text-center py-8 sm:py-12">
                <svg className="w-12 h-12 sm:w-16 sm:h-16 text-text-muted mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="text-xs sm:text-sm font-semibold text-text-secondary mb-1">
                  Statistics Feature Coming Soon
                </p>
                <p className="text-[10px] sm:text-xs text-text-muted">
                  Team statistics will be displayed here
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* QR Code Modal */}
      {showQRCode && clubId && teamId && (
        <TeamQRCode
          teamId={teamId}
          clubId={clubId}
          teamName={team.name}
          onClose={() => setShowQRCode(false)}
        />
      )}

      {/* Invite Codes Modal */}
      {showInviteCodes && clubId && teamId && user && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
            onClick={() => setShowInviteCodes(false)}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-app-card w-full max-w-2xl rounded-2xl border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-white/10 sticky top-0 bg-app-card">
                <div>
                  <h2 className="text-lg font-bold text-text-primary">Invite Codes</h2>
                  <p className="text-sm text-text-secondary">{team.name}</p>
                </div>
                <button
                  onClick={() => setShowInviteCodes(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="p-4">
                <TeamInviteCodes
                  clubId={clubId}
                  teamId={teamId}
                  team={team}
                  userId={user.id}
                  onUpdate={loadTeamData}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </Container>
  );
}
