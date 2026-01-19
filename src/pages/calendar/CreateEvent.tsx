/**
 * Create Event Page - UPDATED
 * Mobile-first, compact design with all required fields
 * Features: 24h time, duration, calendar picker, attachments, reminders, lock period
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePermissions } from '../../hooks/usePermissions';
import Container from '../../components/layout/Container';
import { createEvent } from '../../services/firebase/events';
import { getUserClubs } from '../../services/firebase/clubs';
import type { Club } from '../../types';

interface ReminderType {
  id: string;
  minutesBefore: number;
}

export default function CreateEvent() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { isTrainer: _isTrainer, isClubOwner: _isClubOwner } = usePermissions();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'training', // training, match, tournament, custom
    customType: '',
    date: '',
    startHour: '',
    startMinute: '00',
    duration: 60, // minutes
    endTime: '',
    location: '',
    visibility: 'team' as 'personal' | 'team' | 'club',
    clubId: '',
    teamId: '',
    participantLimit: null as number | null,
    attachment: null as File | null,
    attachmentUrl: '',
    attachmentName: '',
  });

  // Lock period state
  const [lockEnabled, setLockEnabled] = useState(false);
  const [lockHours, setLockHours] = useState('2');
  const [lockMinutes, setLockMinutes] = useState('0');
  const [notifyOnLock, setNotifyOnLock] = useState(false);

  // Reminders state
  const [reminders, setReminders] = useState<ReminderType[]>([]);
  const [showReminderConfig, setShowReminderConfig] = useState(false);
  const [customReminderHours, setCustomReminderHours] = useState('');
  const [customReminderMinutes, setCustomReminderMinutes] = useState('');

  // Calendar picker state
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  // Load clubs on mount
  useEffect(() => {
    if (user) {
      loadClubs();
    }
  }, [user]);

  // Pre-fill date from URL parameter (from calendar view)
  useEffect(() => {
    const dateParam = searchParams.get('date');
    if (dateParam) {
      setFormData(f => ({ ...f, date: dateParam }));
    }
  }, [searchParams]);

  // Calculate end time when start time or duration changes
  useEffect(() => {
    if (formData.startHour && formData.startMinute !== '' && formData.duration) {
      const calculated = calculateEndTime(
        `${formData.startHour}:${formData.startMinute}`,
        formData.duration
      );
      setFormData(f => ({ ...f, endTime: calculated }));
    }
  }, [formData.startHour, formData.startMinute, formData.duration]);

  const calculateEndTime = (startTime: string, durationMinutes: number): string => {
    if (!startTime) return '';

    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + durationMinutes;
    const endMinutesInDay = totalMinutes % 1440; // 1440 minutes in a day

    const endHours = Math.floor(endMinutesInDay / 60);
    const endMinutes = endMinutesInDay % 60;

    return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
  };

  // Format date in local timezone (YYYY-MM-DD) without UTC conversion
  const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const loadClubs = async () => {
    if (!user) return;

    try {
      const userClubs = await getUserClubs(user.id);
      setClubs(userClubs);
    } catch (error) {
      console.error('Error loading clubs:', error);
    }
  };

  const selectedClub = clubs.find(c => c.id === formData.clubId);

  // Add preset reminder
  const addPresetReminder = (minutes: number) => {
    if (reminders.length >= 5) {
      setError('Maximum 5 reminders allowed');
      return;
    }

    const newReminder: ReminderType = {
      id: `reminder-${Date.now()}`,
      minutesBefore: minutes
    };

    setReminders([...reminders, newReminder]);
  };

  // Add custom reminder
  const addCustomReminder = () => {
    const hours = parseInt(customReminderHours) || 0;
    const minutes = parseInt(customReminderMinutes) || 0;
    const totalMinutes = (hours * 60) + minutes;

    if (totalMinutes <= 0) {
      setError('Please enter a valid reminder time');
      return;
    }

    if (reminders.length >= 5) {
      setError('Maximum 5 reminders allowed');
      return;
    }

    const newReminder: ReminderType = {
      id: `reminder-${Date.now()}`,
      minutesBefore: totalMinutes
    };

    setReminders([...reminders, newReminder]);
    setCustomReminderHours('');
    setCustomReminderMinutes('');
    setShowReminderConfig(false);
  };

  // Remove reminder
  const removeReminder = (id: string) => {
    setReminders(reminders.filter(r => r.id !== id));
  };

  // Format reminder text
  const formatReminderText = (minutesBefore: number): string => {
    if (minutesBefore < 60) {
      return `${minutesBefore} ${t('events.reminders.units.minutes')}`;
    } else if (minutesBefore < 1440) {
      const hours = Math.floor(minutesBefore / 60);
      return `${hours} ${t('events.reminders.units.hours')}`;
    } else {
      const days = Math.floor(minutesBefore / 1440);
      return `${days} ${t('events.reminders.units.days')}`;
    }
  };

  // Handle file attachment
  const handleFileAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError('File must be less than 10MB');
      return;
    }

    setFormData(f => ({
      ...f,
      attachment: file,
      attachmentName: file.name
    }));

    // Convert to base64 for storage
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(f => ({
        ...f,
        attachmentUrl: reader.result as string
      }));
    };
    reader.readAsDataURL(file);
  };

  // Remove attachment
  const removeAttachment = () => {
    setFormData(f => ({
      ...f,
      attachment: null,
      attachmentUrl: '',
      attachmentName: ''
    }));
  };

  // Calendar picker functions
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek };
  };

  const selectDate = (day: number) => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const selectedDate = new Date(year, month, day);
    const formattedDate = formatLocalDate(selectedDate);

    setFormData(f => ({ ...f, date: formattedDate }));
    setShowCalendarPicker(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      setError(t('events.create.notLoggedIn'));
      return;
    }

    // Validation
    if (!formData.title || !formData.date) {
      setError('Title and Date are required');
      return;
    }

    if (formData.type === 'custom' && !formData.customType.trim()) {
      setError('Please enter a custom event type');
      return;
    }

    if (formData.visibility === 'team' && !formData.teamId) {
      setError('Please select a team for team events');
      return;
    }

    if (formData.visibility === 'club' && !formData.clubId) {
      setError('Please select a club for club events');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const startTime = formData.startHour && formData.startMinute !== ''
        ? `${formData.startHour}:${formData.startMinute}`
        : undefined;

      const eventData: any = {
        title: formData.title,
        description: formData.description || '',
        type: formData.type === 'custom' ? formData.customType.trim() : formData.type,
        date: formData.date,
        duration: formData.duration,
        visibilityLevel: formData.visibility,
        createdBy: user.id,
        participantLimit: formData.participantLimit || null,
        responses: {},
        confirmedCount: 0,
        reminders: reminders.map(r => ({
          id: r.id,
          minutesBefore: r.minutesBefore,
          sent: false
        })),
        lockPeriod: lockEnabled ? {
          enabled: true,
          minutesBefore: (parseInt(lockHours) || 0) * 60 + (parseInt(lockMinutes) || 0),
          notifyOnLock: notifyOnLock
        } : {
          enabled: false,
          minutesBefore: 0,
          notifyOnLock: false
        }
      };

      // Add optional fields only if they have values
      if (startTime) {
        eventData.startTime = startTime;
      }
      if (formData.endTime) {
        eventData.endTime = formData.endTime;
      }
      if (formData.location) {
        eventData.location = formData.location;
      }
      if (formData.visibility !== 'personal') {
        eventData.clubId = formData.clubId;
      }
      if (formData.visibility === 'team') {
        eventData.teamId = formData.teamId;
      }
      if (formData.attachmentUrl) {
        eventData.attachmentUrl = formData.attachmentUrl;
        eventData.attachmentName = formData.attachmentName;
      }

      await createEvent(eventData);
      navigate('/calendar');
    } catch (err) {
      console.error('Error creating event:', err);
      setError(t('events.create.error'));
    } finally {
      setLoading(false);
    }
  };

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth(calendarMonth);

  return (
    <Container className="max-w-2xl py-2 sm:py-4">
      {/* Header */}
      <div className="mb-3 sm:mb-4">
        <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-text-primary">
          {t('events.create.title')}
        </h1>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-app-card rounded-xl sm:rounded-2xl border border-white/10 p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4">
        
        {/* Title */}
        <div>
          <label className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
            {t('events.create.fields.title')} *
          </label>
          <input
            type="text"
            required
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full px-3 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
            placeholder={t('events.create.placeholders.title')}
          />
        </div>

        {/* Type & Participant Limit */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
              {t('events.create.fields.eventType')}
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
            >
              <option value="training">Training</option>
              <option value="match">Match</option>
              <option value="tournament">Tournament</option>
              <option value="meeting">Meeting</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
              Participant Limit
            </label>
            <input
              type="number"
              min="1"
              value={formData.participantLimit || ''}
              onChange={(e) => setFormData({ ...formData, participantLimit: e.target.value ? parseInt(e.target.value) : null })}
              className="w-full px-3 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
              placeholder="No limit"
            />
          </div>
        </div>

        {/* Custom Type (if selected) */}
        {formData.type === 'custom' && (
          <div>
            <label className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
              Custom Event Type *
            </label>
            <input
              type="text"
              required
              value={formData.customType}
              onChange={(e) => setFormData({ ...formData, customType: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
              placeholder="Enter custom type"
            />
          </div>
        )}

        {/* Date Picker Button */}
        <div>
          <label className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
            {t('events.create.fields.date')} *
          </label>
          <div className="relative">
            <input
              type="text"
              required
              value={formData.date}
              onClick={() => setShowCalendarPicker(true)}
              readOnly
              className="w-full px-3 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary cursor-pointer focus:outline-none focus:ring-2 focus:ring-app-blue"
              placeholder="Select date"
            />
            <button
              type="button"
              onClick={() => setShowCalendarPicker(true)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded transition-colors"
            >
              <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Start Time (24h) + Duration + End Time */}
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-2 sm:gap-3">
          {/* Start Time */}
          <div className="sm:col-span-2">
            <label className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
              Start Time (24h)
            </label>
            <div className="flex gap-2">
              <select
                value={formData.startHour}
                onChange={(e) => setFormData({ ...formData, startHour: e.target.value })}
                className="flex-1 px-2 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
              >
                <option value="">HH</option>
                {Array.from({ length: 24 }, (_, i) => {
                  const hour = String(i).padStart(2, '0');
                  return <option key={hour} value={hour}>{hour}</option>;
                })}
              </select>
              
              <span className="text-text-muted self-center">:</span>
              
              <select
                value={formData.startMinute}
                onChange={(e) => setFormData({ ...formData, startMinute: e.target.value })}
                className="flex-1 px-2 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
              >
                <option value="00">00</option>
                <option value="15">15</option>
                <option value="30">30</option>
                <option value="45">45</option>
              </select>
            </div>
          </div>

          {/* Duration */}
          <div className="sm:col-span-3">
            <label className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
              Duration
            </label>
            <select
              value={formData.duration}
              onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
              className="w-full px-3 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
            >
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
              <option value="120">2 hours</option>
              <option value="150">2.5 hours</option>
              <option value="180">3 hours</option>
            </select>
          </div>

          {/* End Time (Auto-calculated) */}
          <div className="sm:col-span-2">
            <label className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
              End Time
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.endTime}
                readOnly
                className="w-full px-3 py-2 text-sm bg-app-secondary/50 border border-white/10 rounded-lg text-text-muted cursor-not-allowed"
                title="Auto-calculated"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-app-cyan" title="Auto-calculated">
                ⚡
              </span>
            </div>
          </div>
        </div>

        {/* Location */}
        <div>
          <label className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
            {t('events.create.fields.location')}
          </label>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            className="w-full px-3 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
            placeholder={t('events.create.placeholders.location')}
          />
        </div>

        {/* Visibility & Club/Team Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
              Visibility *
            </label>
            <select
              value={formData.visibility}
              onChange={(e) => setFormData({ ...formData, visibility: e.target.value as any, teamId: '', clubId: '' })}
              className="w-full px-3 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
            >
              <option value="personal">Personal</option>
              <option value="team">Team</option>
              <option value="club">Club</option>
            </select>
          </div>

          {formData.visibility !== 'personal' && (
            <div>
              <label className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
                {t('events.create.fields.club')} *
              </label>
              <select
                required
                value={formData.clubId}
                onChange={(e) => setFormData({ ...formData, clubId: e.target.value, teamId: '' })}
                className="w-full px-3 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
              >
                <option value="">{t('events.create.selectClub')}</option>
                {clubs.map((club) => (
                  <option key={club.id} value={club.id!}>
                    {club.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Team Selection (if team visibility) */}
        {formData.visibility === 'team' && selectedClub && selectedClub.teams && selectedClub.teams.length > 0 && (
          <div>
            <label className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
              {t('events.create.fields.team')} *
            </label>
            <select
              required
              value={formData.teamId}
              onChange={(e) => setFormData({ ...formData, teamId: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
            >
              <option value="">{t('events.create.selectTeam')}</option>
              {selectedClub.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Description */}
        <div>
          <label className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
            {t('events.create.fields.description')}
          </label>
          <textarea
            rows={3}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-3 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue resize-none"
            placeholder={t('events.create.placeholders.description')}
          />
        </div>

        {/* Attachment */}
        <div>
          <label className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
            Attachment
          </label>
          {!formData.attachment ? (
            <label className="flex items-center justify-center w-full px-3 py-3 border-2 border-dashed border-white/10 rounded-lg cursor-pointer hover:border-app-blue transition-colors">
              <div className="text-center">
                <svg className="w-6 h-6 mx-auto mb-1 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-xs text-text-muted">Upload file (max 10MB)</span>
              </div>
              <input
                type="file"
                className="hidden"
                accept="image/*,.pdf,.doc,.docx"
                onChange={handleFileAttachment}
              />
            </label>
          ) : (
            <div className="flex items-center justify-between p-2 bg-app-secondary border border-white/10 rounded-lg">
              <span className="text-xs text-text-primary truncate">{formData.attachmentName}</span>
              <button
                type="button"
                onClick={removeAttachment}
                className="ml-2 p-1 hover:bg-white/10 rounded transition-colors"
              >
                <svg className="w-4 h-4 text-chart-pink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Event Reminders */}
        <div className="bg-app-secondary border border-white/10 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs sm:text-sm font-semibold text-text-primary">
              {t('events.reminders.title')}
            </h3>
            <button
              type="button"
              onClick={() => setShowReminderConfig(!showReminderConfig)}
              className="text-xs text-app-cyan hover:text-app-cyan/80"
            >
              + Custom
            </button>
          </div>

          {/* Preset Reminders */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
            <button type="button" onClick={() => addPresetReminder(15)} className="px-2 py-2 text-xs bg-app-card border border-white/10 text-text-primary rounded-lg hover:bg-white/10 transition-all">
              15 min
            </button>
            <button type="button" onClick={() => addPresetReminder(30)} className="px-2 py-2 text-xs bg-app-card border border-white/10 text-text-primary rounded-lg hover:bg-white/10 transition-all">
              30 min
            </button>
            <button type="button" onClick={() => addPresetReminder(60)} className="px-2 py-2 text-xs bg-app-card border border-white/10 text-text-primary rounded-lg hover:bg-white/10 transition-all">
              1 hour
            </button>
            <button type="button" onClick={() => addPresetReminder(180)} className="px-2 py-2 text-xs bg-app-card border border-white/10 text-text-primary rounded-lg hover:bg-white/10 transition-all">
              3 hours
            </button>
            <button type="button" onClick={() => addPresetReminder(1440)} className="px-2 py-2 text-xs bg-app-card border border-white/10 text-text-primary rounded-lg hover:bg-white/10 transition-all">
              1 day
            </button>
            <button type="button" onClick={() => addPresetReminder(10080)} className="px-2 py-2 text-xs bg-app-card border border-white/10 text-text-primary rounded-lg hover:bg-white/10 transition-all">
              1 week
            </button>
          </div>

          {/* Custom Reminder Config */}
          {showReminderConfig && (
            <div className="bg-app-card border border-white/10 rounded-lg p-2 mb-2">
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  value={customReminderHours}
                  onChange={(e) => setCustomReminderHours(e.target.value)}
                  className="flex-1 px-2 py-1 text-xs bg-app-secondary border border-white/10 rounded text-text-primary"
                  placeholder="Hours"
                />
                <input
                  type="number"
                  min="0"
                  value={customReminderMinutes}
                  onChange={(e) => setCustomReminderMinutes(e.target.value)}
                  className="flex-1 px-2 py-1 text-xs bg-app-secondary border border-white/10 rounded text-text-primary"
                  placeholder="Minutes"
                />
                <button
                  type="button"
                  onClick={addCustomReminder}
                  className="px-3 py-1 text-xs bg-app-blue text-white rounded hover:bg-app-blue/80"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {/* Active Reminders */}
          {reminders.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-text-secondary">Active ({reminders.length}/5)</h4>
              {reminders.map((reminder) => (
                <div
                  key={reminder.id}
                  className="flex items-center justify-between p-2 bg-app-card border border-white/10 rounded"
                >
                  <span className="text-xs text-text-primary">
                    {formatReminderText(reminder.minutesBefore)} before
                  </span>
                  <button
                    type="button"
                    onClick={() => removeReminder(reminder.id)}
                    className="p-0.5 hover:bg-white/10 rounded transition-colors"
                  >
                    <svg className="w-3.5 h-3.5 text-chart-pink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {reminders.length === 0 && (
            <p className="text-xs text-text-muted text-center py-2">
              {t('events.reminders.noReminders')}
            </p>
          )}
        </div>

        {/* Lock Period */}
        <div className="bg-app-secondary border border-white/10 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs sm:text-sm font-semibold text-text-primary">
              Lock Period
            </h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={lockEnabled}
                onChange={(e) => setLockEnabled(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs text-text-secondary">Enable</span>
            </label>
          </div>

          {lockEnabled && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-text-muted mb-1">Hours</label>
                  <input
                    type="number"
                    min="0"
                    value={lockHours}
                    onChange={(e) => setLockHours(e.target.value)}
                    className="w-full px-2 py-2 text-sm bg-app-card border border-white/10 rounded text-text-primary"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-text-muted mb-1">Minutes</label>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={lockMinutes}
                    onChange={(e) => setLockMinutes(e.target.value)}
                    className="w-full px-2 py-2 text-sm bg-app-card border border-white/10 rounded text-text-primary"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyOnLock}
                  onChange={(e) => setNotifyOnLock(e.target.checked)}
                  className="rounded"
                />
                <span className="text-xs text-text-secondary">Notify participants when event locks</span>
              </label>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-chart-pink/20 border border-chart-pink/30 rounded-lg p-3">
            <p className="text-xs text-chart-pink">{error}</p>
          </div>
        )}

        {/* Submit Buttons */}
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <button
            type="button"
            onClick={() => navigate('/calendar')}
            className="flex-1 px-4 py-2.5 sm:py-3 bg-app-secondary border border-white/10 text-white rounded-lg hover:bg-white/10 transition-all text-sm font-semibold"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-4 py-2.5 sm:py-3 bg-gradient-primary text-white rounded-lg shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('common.creating') : t('events.create.submit')}
          </button>
        </div>
      </form>

      {/* Calendar Picker Modal */}
      {showCalendarPicker && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
            onClick={() => setShowCalendarPicker(false)}
          />

          {/* Calendar Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-app-card w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <button
                  type="button"
                  onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h2 className="text-base font-bold text-text-primary">
                  {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </h2>
                <button
                  type="button"
                  onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* Calendar Grid */}
              <div className="p-4">
                {/* Day Names */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
                    <div key={day} className="text-center text-xs font-medium text-text-muted py-1">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Days */}
                <div className="grid grid-cols-7 gap-1">
                  {/* Empty cells for days before month starts */}
                  {Array.from({ length: startingDayOfWeek }).map((_, i) => (
                    <div key={`empty-${i}`} className="aspect-square" />
                  ))}

                  {/* Days of the month */}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const isToday = new Date().toDateString() === new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day).toDateString();
                    const selectedDate = formData.date ? new Date(formData.date) : null;
                    const isSelected = selectedDate?.toDateString() === new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day).toDateString();

                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => selectDate(day)}
                        className={`aspect-square flex items-center justify-center rounded-lg text-sm font-medium transition-all ${
                          isSelected
                            ? 'bg-app-blue text-white'
                            : isToday
                            ? 'bg-app-cyan/20 text-app-cyan'
                            : 'text-text-primary hover:bg-white/10'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="flex gap-2 p-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setFormData({ ...formData, date: formatLocalDate(new Date()) });
                    setShowCalendarPicker(false);
                  }}
                  className="flex-1 px-4 py-2 bg-app-secondary border border-white/10 text-text-primary rounded-lg hover:bg-white/10 transition-all text-sm"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setShowCalendarPicker(false)}
                  className="flex-1 px-4 py-2 bg-app-blue text-white rounded-lg hover:bg-app-blue/80 transition-all text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </Container>
  );
}
