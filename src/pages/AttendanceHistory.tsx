import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import Container from '../components/layout/Container';
import { getTeamAttendance } from '../services/firebase/attendance';
import type { Attendance, SessionType } from '../types/attendance';

export default function AttendanceHistory() {
  const { clubId, teamId } = useParams<{ clubId: string; teamId: string }>();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [attendanceRecords, setAttendanceRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | SessionType>('all');

  useEffect(() => {
    loadAttendanceHistory();
  }, [clubId, teamId]);

  async function loadAttendanceHistory() {
    if (!clubId || !teamId) return;

    try {
      setLoading(true);
      const records = await getTeamAttendance(teamId, {}, 50);
      // Already sorted by date descending from Firebase query
      setAttendanceRecords(records);
    } catch (error) {
      console.error('Error loading attendance history:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleTakeAttendance() {
    navigate(`/clubs/${clubId}/teams/${teamId}/attendance/take`);
  }

  function handleViewDetails(attendanceId: string) {
    navigate(`/clubs/${clubId}/teams/${teamId}/attendance/${attendanceId}`);
  }

  const filteredRecords = filter === 'all'
    ? attendanceRecords
    : attendanceRecords.filter(record => record.sessionType === filter);

  if (loading) {
    return (
      <Container>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-text-secondary">{t('common.loading')}</div>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div className="max-w-6xl mx-auto py-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">
              {t('attendance.history')}
            </h1>
          </div>
          <button
            onClick={handleTakeAttendance}
            className="bg-gradient-primary text-white font-semibold px-8 py-4 rounded-xl shadow-button hover:shadow-button-hover transition-all duration-300 hover:-translate-y-0.5"
          >
            {t('attendance.takeAttendance')}
          </button>
        </div>

        {/* Filter */}
        <div className="bg-app-card border border-white/10 rounded-2xl p-6 shadow-card mb-6">
          <div className="flex flex-wrap gap-2">
            {['all', 'practice', 'game', 'meeting', 'other'].map((filterOption) => (
              <button
                key={filterOption}
                onClick={() => setFilter(filterOption as typeof filter)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  filter === filterOption
                    ? 'bg-gradient-primary text-white shadow-button'
                    : 'bg-white/10 text-text-secondary hover:bg-white/15'
                }`}
              >
                {filterOption === 'all'
                  ? t('common.all')
                  : t(`attendance.types.${filterOption}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Statistics Summary */}
        {filteredRecords.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-app-card border border-white/10 rounded-2xl p-6 shadow-card">
              <div className="text-sm text-text-secondary mb-2">
                {t('attendance.totalSessions')}
              </div>
              <div className="text-3xl font-bold text-app-cyan">
                {filteredRecords.length}
              </div>
            </div>
            <div className="bg-app-card border border-white/10 rounded-2xl p-6 shadow-card">
              <div className="text-sm text-text-secondary mb-2">
                {t('attendance.avgAttendance')}
              </div>
              <div className="text-3xl font-bold text-chart-cyan">
                {Math.round(
                  filteredRecords.reduce((sum, r) => sum + r.attendanceRate, 0) /
                    filteredRecords.length
                )}
                %
              </div>
            </div>
            <div className="bg-app-card border border-white/10 rounded-2xl p-6 shadow-card">
              <div className="text-sm text-text-secondary mb-2">
                {t('attendance.avgPresent')}
              </div>
              <div className="text-3xl font-bold text-chart-blue">
                {Math.round(
                  filteredRecords.reduce((sum, r) => sum + r.presentCount, 0) /
                    filteredRecords.length
                )}
              </div>
            </div>
            <div className="bg-app-card border border-white/10 rounded-2xl p-6 shadow-card">
              <div className="text-sm text-text-secondary mb-2">
                {t('attendance.avgAbsent')}
              </div>
              <div className="text-3xl font-bold text-chart-pink">
                {Math.round(
                  filteredRecords.reduce((sum, r) => sum + r.absentCount, 0) /
                    filteredRecords.length
                )}
              </div>
            </div>
          </div>
        )}

        {/* Attendance List */}
        <div className="space-y-4">
          {filteredRecords.length === 0 ? (
            <div className="bg-app-card border border-white/10 rounded-2xl p-12 shadow-card text-center">
              <div className="text-text-muted mb-4">
                {t('attendance.noRecords')}
              </div>
              <button
                onClick={handleTakeAttendance}
                className="bg-gradient-primary text-white font-semibold px-8 py-4 rounded-xl shadow-button hover:shadow-button-hover transition-all duration-300 hover:-translate-y-0.5"
              >
                {t('attendance.takeFirstAttendance')}
              </button>
            </div>
          ) : (
            filteredRecords.map((record) => (
              <div
                key={record.id}
                className="bg-app-card border border-white/10 rounded-2xl p-6 shadow-card hover:border-app-blue/30 transition-all cursor-pointer"
                onClick={() => record.id && handleViewDetails(record.id)}
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  {/* Left: Date and Type */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="text-lg font-bold text-text-primary">
                        {new Date(record.sessionDate).toLocaleDateString(undefined, {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          record.sessionType === 'game'
                            ? 'bg-chart-pink/20 text-chart-pink'
                            : record.sessionType === 'practice'
                            ? 'bg-chart-blue/20 text-chart-blue'
                            : 'bg-chart-purple/20 text-chart-purple'
                        }`}
                      >
                        {t(`attendance.types.${record.sessionType}`)}
                      </span>
                    </div>
                    {record.eventId && (
                      <div className="text-sm text-text-muted">
                        {t('attendance.linkedToEvent')}
                      </div>
                    )}
                  </div>

                  {/* Right: Stats */}
                  <div className="flex gap-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-chart-cyan">
                        {record.presentCount}
                      </div>
                      <div className="text-xs text-text-muted">
                        {t('attendance.status.present')}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-chart-pink">
                        {record.absentCount}
                      </div>
                      <div className="text-xs text-text-muted">
                        {t('attendance.status.absent')}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-chart-purple">
                        {record.lateCount}
                      </div>
                      <div className="text-xs text-text-muted">
                        {t('attendance.status.late')}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-app-cyan">
                        {Math.round(record.attendanceRate)}%
                      </div>
                      <div className="text-xs text-text-muted">
                        {t('attendance.rate')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Container>
  );
}

