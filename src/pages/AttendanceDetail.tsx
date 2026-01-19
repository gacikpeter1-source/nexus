import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import Container from '../components/layout/Container';
import { getAttendance, deleteAttendance } from '../services/firebase/attendance';
import type { Attendance } from '../types/attendance';

export default function AttendanceDetail() {
  const { clubId, teamId, attendanceId } = useParams<{ clubId: string; teamId: string; attendanceId: string }>();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadAttendance();
  }, [attendanceId]);

  async function loadAttendance() {
    if (!attendanceId) return;

    try {
      setLoading(true);
      const data = await getAttendance(attendanceId);
      setAttendance(data);
    } catch (error) {
      console.error('Error loading attendance:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!attendanceId || !confirm(t('attendance.confirmDelete'))) return;

    try {
      setDeleting(true);
      await deleteAttendance(attendanceId);
      navigate(`/clubs/${clubId}/teams/${teamId}/attendance`);
    } catch (error) {
      console.error('Error deleting attendance:', error);
      alert(t('attendance.deleteError'));
    } finally {
      setDeleting(false);
    }
  }

  function handleEdit() {
    navigate(`/clubs/${clubId}/teams/${teamId}/attendance/${attendanceId}/edit`);
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

  if (!attendance) {
    return (
      <Container>
        <div className="text-center py-12">
          <div className="text-text-muted mb-4">{t('attendance.notFound')}</div>
          <button
            onClick={() => navigate(`/clubs/${clubId}/teams/${teamId}/attendance`)}
            className="bg-gradient-primary text-white font-semibold px-8 py-4 rounded-xl shadow-button hover:shadow-button-hover transition-all duration-300"
          >
            {t('common.goBack')}
          </button>
        </div>
      </Container>
    );
  }

  const statusCounts = {
    present: attendance.presentCount,
    absent: attendance.absentCount,
    late: attendance.lateCount,
    excused: Object.values(attendance.records).filter(r => r.status === 'excused').length,
  };

  return (
    <Container>
      <div className="max-w-6xl mx-auto py-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">
              {t('attendance.details')}
            </h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleEdit}
              className="bg-white/10 border border-white/20 text-white font-semibold px-6 py-3 rounded-xl hover:bg-white/15 transition-all duration-300"
            >
              {t('common.edit')}
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-chart-pink/20 border border-chart-pink text-chart-pink font-semibold px-6 py-3 rounded-xl hover:bg-chart-pink/30 transition-all duration-300 disabled:opacity-50"
            >
              {deleting ? t('common.deleting') : t('common.delete')}
            </button>
          </div>
        </div>

        {/* Session Info */}
        <div className="bg-app-card border border-white/10 rounded-2xl p-6 shadow-card mb-6">
          <h2 className="text-xl font-bold text-text-primary mb-4">
            {t('attendance.sessionInfo')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-text-muted mb-1">{t('attendance.sessionType')}</div>
              <div className="text-lg font-semibold text-text-primary">
                {t(`attendance.types.${attendance.sessionType}`)}
              </div>
            </div>
            <div>
              <div className="text-sm text-text-muted mb-1">{t('attendance.totalMembers')}</div>
              <div className="text-lg font-semibold text-text-primary">
                {attendance.totalMembers}
              </div>
            </div>
            <div>
              <div className="text-sm text-text-muted mb-1">{t('attendance.attendanceRate')}</div>
              <div className="text-lg font-semibold text-app-cyan">
                {Math.round(attendance.attendanceRate)}%
              </div>
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-app-card border border-white/10 rounded-2xl p-6 shadow-card">
            <div className="text-sm text-text-secondary mb-2">
              {t('attendance.status.present')}
            </div>
            <div className="text-3xl font-bold text-chart-cyan">{statusCounts.present}</div>
          </div>
          <div className="bg-app-card border border-white/10 rounded-2xl p-6 shadow-card">
            <div className="text-sm text-text-secondary mb-2">
              {t('attendance.status.absent')}
            </div>
            <div className="text-3xl font-bold text-chart-pink">{statusCounts.absent}</div>
          </div>
          <div className="bg-app-card border border-white/10 rounded-2xl p-6 shadow-card">
            <div className="text-sm text-text-secondary mb-2">
              {t('attendance.status.late')}
            </div>
            <div className="text-3xl font-bold text-chart-purple">{statusCounts.late}</div>
          </div>
          <div className="bg-app-card border border-white/10 rounded-2xl p-6 shadow-card">
            <div className="text-sm text-text-secondary mb-2">
              {t('attendance.status.excused')}
            </div>
            <div className="text-3xl font-bold text-chart-blue">{statusCounts.excused}</div>
          </div>
        </div>

        {/* Member Records */}
        <div className="bg-app-card border border-white/10 rounded-2xl p-6 shadow-card">
          <h2 className="text-xl font-bold text-text-primary mb-4">
            {t('attendance.memberRecords')}
          </h2>
          <div className="space-y-3">
            {Object.entries(attendance.records).map(([userId, record]) => (
              <div
                key={userId}
                className="bg-app-secondary border border-white/10 rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3"
              >
                <div className="flex-1">
                  <div className="font-semibold text-text-primary mb-1">
                    {userId} {/* TODO: Display actual name */}
                  </div>
                  {record.notes && (
                    <div className="text-sm text-text-muted">{record.notes}</div>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  {record.arrivedAt && (
                    <div className="text-sm text-text-secondary">
                      {t('attendance.arrivedAt')}:{' '}
                      {new Date(record.arrivedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  )}
                  {record.duration && (
                    <div className="text-sm text-text-secondary">
                      {record.duration} {t('attendance.minutes')}
                    </div>
                  )}
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      record.status === 'present'
                        ? 'bg-chart-cyan/20 text-chart-cyan'
                        : record.status === 'absent'
                        ? 'bg-chart-pink/20 text-chart-pink'
                        : record.status === 'late'
                        ? 'bg-chart-purple/20 text-chart-purple'
                        : 'bg-chart-blue/20 text-chart-blue'
                    }`}
                  >
                    {t(`attendance.status.${record.status}`)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Back Button */}
        <div className="mt-6">
          <button
            onClick={() => navigate(`/clubs/${clubId}/teams/${teamId}/attendance`)}
            className="bg-white/10 border border-white/20 text-white font-semibold px-8 py-4 rounded-xl hover:bg-white/15 transition-all duration-300"
          >
            {t('common.back')}
          </button>
        </div>
      </div>
    </Container>
  );
}

