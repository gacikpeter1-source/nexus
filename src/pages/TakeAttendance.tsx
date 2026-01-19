import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import Container from '../components/layout/Container';
import { createAttendance, updateAttendance, getTeamAttendance } from '../services/firebase/attendance';
import { getEvent } from '../services/firebase/events';
import { getUser } from '../services/firebase/users';
import type { AttendanceStatus, AttendanceRecord, SessionType, Attendance } from '../types/attendance';
import type { Event, EventResponseData } from '../types';

interface MemberAttendance {
  userId: string;
  displayName: string;
  status: AttendanceStatus;
  notes?: string;
}

interface EventResponse {
  userId: string;
  userName: string;
  response: string;
  message?: string;
  timestamp: any;
}

export default function TakeAttendance() {
  const { eventId, clubId, teamId } = useParams<{ eventId?: string; clubId: string; teamId: string }>();
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [_event, setEvent] = useState<Event | null>(null);
  const [members, setMembers] = useState<MemberAttendance[]>([]);
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [sessionType, setSessionType] = useState<SessionType>('practice');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingAttendanceId, setExistingAttendanceId] = useState<string | null>(null);
  const [eventResponses, setEventResponses] = useState<EventResponse[]>([]);

  useEffect(() => {
    loadData();
  }, [eventId]);

  async function loadData() {
    if (!clubId || !teamId) return;

    try {
      setLoading(true);

      // If eventId is provided, load event details
      if (eventId) {
        const eventData = await getEvent(eventId);
        if (eventData) {
          setEvent(eventData);
          setSessionDate(eventData.date);
          setSessionType(eventData.category === 'game' ? 'game' : 'practice');

          // Load event responses with user names
          if (eventData.responses) {
            const responsesArray = await Promise.all(
              Object.entries(eventData.responses).map(async ([userId, responseData]) => {
                try {
                  const userData = await getUser(userId);
                  return {
                    userId,
                    userName: userData?.displayName || userData?.email || 'Unknown User',
                    response: (responseData as EventResponseData).response,
                    message: (responseData as EventResponseData).message,
                    timestamp: (responseData as EventResponseData).timestamp,
                  };
                } catch (error) {
                  return {
                    userId,
                    userName: 'Unknown User',
                    response: (responseData as EventResponseData).response,
                    message: (responseData as EventResponseData).message,
                    timestamp: (responseData as EventResponseData).timestamp,
                  };
                }
              })
            );
            // Sort by response type (confirmed first)
            responsesArray.sort((a, b) => {
              const order = { confirmed: 0, maybe: 1, declined: 2 };
              return (order[a.response as keyof typeof order] || 3) - (order[b.response as keyof typeof order] || 3);
            });
            setEventResponses(responsesArray);
          }

          // Check if attendance already exists for this event
          const teamAttendances = await getTeamAttendance(teamId, {}, 100);
          const existingAttendance = teamAttendances.find((a: Attendance) => a.eventId === eventId);
          
          if (existingAttendance && existingAttendance.id) {
            setExistingAttendanceId(existingAttendance.id);
            // Load existing attendance records
            const memberList: MemberAttendance[] = Object.entries(existingAttendance.records).map(([userId, record]) => {
              const attendanceRecord = record as AttendanceRecord;
              return {
                userId,
                displayName: userId, // TODO: Fetch actual display names
                status: attendanceRecord.status,
                notes: attendanceRecord.notes,
              };
            });
            setMembers(memberList);
          } else {
            // Initialize empty attendance for team members
            initializeMembers();
          }
        }
      } else {
        // Initialize for manual session (not linked to event)
        initializeMembers();
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  function initializeMembers() {
    // TODO: Fetch actual team members from Firestore
    // For now, using placeholder
    setMembers([
      { userId: 'member1', displayName: 'Member 1', status: 'present' },
      { userId: 'member2', displayName: 'Member 2', status: 'present' },
      { userId: 'member3', displayName: 'Member 3', status: 'present' },
    ]);
  }

  function handleStatusChange(userId: string, status: AttendanceStatus) {
    setMembers(prev =>
      prev.map(m => (m.userId === userId ? { ...m, status } : m))
    );
  }

  function handleNotesChange(userId: string, notes: string) {
    setMembers(prev =>
      prev.map(m => (m.userId === userId ? { ...m, notes } : m))
    );
  }

  async function handleSave() {
    if (!clubId || !teamId || !user) return;

    try {
      setSaving(true);

      const records: { [userId: string]: AttendanceRecord } = {};
      members.forEach(member => {
        records[member.userId] = {
          status: member.status,
          notes: member.notes,
        };
      });

      if (existingAttendanceId) {
        // Update existing attendance
        await updateAttendance(existingAttendanceId, records);
      } else {
        // Create new attendance
        await createAttendance(
          clubId,
          teamId,
          sessionDate,
          sessionType,
          records,
          user.id,
          eventId
        );
      }

      navigate(`/clubs/${clubId}/teams/${teamId}/attendance`);
    } catch (error) {
      console.error('Error saving attendance:', error);
      alert(t('attendance.saveError') || 'Error saving attendance');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Container>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-text-secondary">{t('common.loading')}</div>
        </div>
      </Container>
    );
  }

  const statusOptions: AttendanceStatus[] = ['present', 'absent', 'late', 'excused'];

  return (
    <Container>
      <div className="max-w-4xl mx-auto py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-text-primary mb-2">
            {t('attendance.takeAttendance')}
          </h1>
        </div>

        {/* Session Info */}
        <div className="bg-app-card border border-white/10 rounded-2xl p-6 shadow-card mb-6">
          <h2 className="text-xl font-bold text-text-primary mb-4">
            {t('attendance.sessionInfo')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('attendance.sessionDate')}
              </label>
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                disabled={!!eventId}
                className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:ring-2 focus:ring-app-blue disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('attendance.sessionType')}
              </label>
              <select
                value={sessionType}
                onChange={(e) => setSessionType(e.target.value as SessionType)}
                disabled={!!eventId}
                className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:ring-2 focus:ring-app-blue disabled:opacity-50"
              >
                <option value="practice">{t('attendance.types.practice')}</option>
                <option value="game">{t('attendance.types.game')}</option>
                <option value="meeting">{t('attendance.types.meeting')}</option>
                <option value="other">{t('attendance.types.other')}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Event Responses (if linked to event) */}
        {eventId && eventResponses.length > 0 && (
          <div className="bg-app-card border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-card mb-6">
            <h2 className="text-lg sm:text-xl font-bold text-text-primary mb-3 sm:mb-4">
              {t('events.response.allResponses')} ({eventResponses.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
              {eventResponses.map((resp) => {
                const getResponseIcon = (response: string) => {
                  switch (response) {
                    case 'confirmed': return '✓';
                    case 'declined': return '✗';
                    case 'maybe': return '?';
                    default: return '';
                  }
                };
                const getResponseColor = (response: string) => {
                  switch (response) {
                    case 'confirmed': return 'text-chart-cyan border-chart-cyan/30 bg-chart-cyan/10';
                    case 'declined': return 'text-chart-pink border-chart-pink/30 bg-chart-pink/10';
                    case 'maybe': return 'text-chart-purple border-chart-purple/30 bg-chart-purple/10';
                    default: return 'text-text-secondary border-white/10 bg-app-secondary';
                  }
                };

                return (
                  <div
                    key={resp.userId}
                    className={`flex items-start gap-2 p-2 sm:p-3 rounded-lg border ${getResponseColor(resp.response)}`}
                  >
                    <span className="text-base sm:text-lg font-bold flex-shrink-0">
                      {getResponseIcon(resp.response)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs sm:text-sm font-medium text-text-primary truncate">
                        {resp.userName}
                      </div>
                      {resp.message && (
                        <p className="text-xs text-text-muted italic mt-1 line-clamp-2">
                          "{resp.message}"
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-around text-center">
              <div>
                <div className="text-lg sm:text-xl font-bold text-chart-cyan">
                  {eventResponses.filter(r => r.response === 'confirmed').length}
                </div>
                <div className="text-xs text-text-muted">{t('events.response.confirmed')}</div>
              </div>
              <div>
                <div className="text-lg sm:text-xl font-bold text-chart-purple">
                  {eventResponses.filter(r => r.response === 'maybe').length}
                </div>
                <div className="text-xs text-text-muted">{t('events.response.maybe')}</div>
              </div>
              <div>
                <div className="text-lg sm:text-xl font-bold text-chart-pink">
                  {eventResponses.filter(r => r.response === 'declined').length}
                </div>
                <div className="text-xs text-text-muted">{t('events.response.declined')}</div>
              </div>
            </div>
          </div>
        )}

        {/* Attendance List */}
        <div className="bg-app-card border border-white/10 rounded-2xl p-6 shadow-card mb-6">
          <h2 className="text-xl font-bold text-text-primary mb-4">
            {t('attendance.members')}
          </h2>
          <div className="space-y-4">
            {members.map((member) => (
              <div
                key={member.userId}
                className="bg-app-secondary border border-white/10 rounded-xl p-4"
              >
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  {/* Member Name */}
                  <div className="flex-1 min-w-[150px]">
                    <span className="font-semibold text-text-primary">
                      {member.displayName}
                    </span>
                  </div>

                  {/* Status Buttons */}
                  <div className="flex gap-2 flex-wrap">
                    {statusOptions.map((status) => (
                      <button
                        key={status}
                        onClick={() => handleStatusChange(member.userId, status)}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${
                          member.status === status
                            ? 'bg-gradient-primary text-white shadow-button'
                            : 'bg-white/10 text-text-secondary hover:bg-white/15'
                        }`}
                      >
                        {t(`attendance.status.${status}`)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <div className="mt-3">
                  <input
                    type="text"
                    placeholder={t('attendance.notesPlaceholder')}
                    value={member.notes || ''}
                    onChange={(e) => handleNotesChange(member.userId, e.target.value)}
                    className="w-full px-3 py-2 bg-app-primary border border-white/10 rounded-lg text-text-primary text-sm placeholder-text-muted focus:ring-2 focus:ring-app-blue"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="bg-app-card border border-white/10 rounded-2xl p-6 shadow-card mb-6">
          <h2 className="text-xl font-bold text-text-primary mb-4">
            {t('attendance.summary')}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statusOptions.map((status) => {
              const count = members.filter((m) => m.status === status).length;
              return (
                <div key={status} className="text-center">
                  <div className="text-3xl font-bold text-app-cyan">{count}</div>
                  <div className="text-sm text-text-secondary">
                    {t(`attendance.status.${status}`)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="text-center">
              <div className="text-sm text-text-secondary mb-1">
                {t('attendance.attendanceRate')}
              </div>
              <div className="text-3xl font-bold text-chart-cyan">
                {members.length > 0
                  ? Math.round(
                      ((members.filter((m) => m.status === 'present' || m.status === 'excused').length) /
                        members.length) *
                        100
                    )
                  : 0}
                %
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            onClick={() => navigate(-1)}
            className="flex-1 bg-white/10 border border-white/20 text-white font-semibold px-8 py-4 rounded-xl hover:bg-white/15 transition-all duration-300"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-gradient-primary text-white font-semibold px-8 py-4 rounded-xl shadow-button hover:shadow-button-hover transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </Container>
  );
}

