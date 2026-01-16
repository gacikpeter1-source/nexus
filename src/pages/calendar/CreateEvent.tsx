/**
 * Create Event Page
 * Form for creating new events (personal/team/club)
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePermissions } from '../../hooks/usePermissions';
import Container from '../../components/layout/Container';
import { createEvent } from '../../services/firebase/events';
import { getUserClubs } from '../../services/firebase/clubs';
import type { Club } from '../../types';

export default function CreateEvent() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { isTrainer } = usePermissions();
  const navigate = useNavigate();

  const [clubs, setClubs] = useState<Club[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: '',
    startTime: '',
    endTime: '',
    type: 'personal' as 'personal' | 'team' | 'club',
    clubId: '',
    teamId: '',
    location: '',
    rsvpRequired: false,
    rsvpDeadline: '',
    maxParticipants: '',
    isRecurring: false,
    recurrenceRule: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      loadClubs();
    }
  }, [user]);

  const loadClubs = async () => {
    if (!user) return;

    try {
      const userClubs = await getUserClubs(user.id);
      setClubs(userClubs);
    } catch (error) {
      console.error('Error loading clubs:', error);
    }
  };

  const getAvailableEventTypes = () => {
    const types: Array<'personal' | 'team' | 'club'> = ['personal'];

    if (formData.clubId && isTrainer(formData.clubId)) {
      types.push('team', 'club');
    }

    return types;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      setError(t('events.create.notLoggedIn'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const eventId = await createEvent({
        title: formData.title,
        description: formData.description,
        date: formData.date,
        startTime: formData.startTime || undefined,
        endTime: formData.endTime || undefined,
        type: formData.type,
        clubId: formData.type !== 'personal' ? formData.clubId : undefined,
        teamId: formData.type === 'team' ? formData.teamId : undefined,
        createdBy: user.id,
        location: formData.location || undefined,
        rsvpRequired: formData.rsvpRequired,
        rsvpDeadline: formData.rsvpDeadline || undefined,
        maxParticipants: formData.maxParticipants ? parseInt(formData.maxParticipants) : undefined,
        isRecurring: formData.isRecurring,
        recurrenceRule: formData.recurrenceRule || undefined,
      });

      navigate(`/calendar/events/${eventId}`);
    } catch (err) {
      console.error('Error creating event:', err);
      setError(t('events.create.error'));
    } finally {
      setLoading(false);
    }
  };

  const selectedClub = clubs.find(c => c.id === formData.clubId);
  const availableTypes = getAvailableEventTypes();

  return (
    <Container className="max-w-3xl">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {t('events.create.title')}
          </h1>
          <p className="mt-2 text-gray-600">
            {t('events.create.subtitle')}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white shadow-sm rounded-lg border border-gray-200 p-6 space-y-6">
          {/* Event Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
              {t('events.create.fields.title')} *
            </label>
            <input
              type="text"
              id="title"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
              placeholder={t('events.create.placeholders.title')}
            />
          </div>

          {/* Event Type & Club */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="clubId" className="block text-sm font-medium text-gray-700 mb-2">
                {t('events.create.fields.club')}
              </label>
              <select
                id="clubId"
                value={formData.clubId}
                onChange={(e) => setFormData({ ...formData, clubId: e.target.value, type: 'personal' })}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
              >
                <option value="">{t('events.create.selectClub')}</option>
                {clubs.map((club) => (
                  <option key={club.id} value={club.id!}>
                    {club.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-2">
                {t('events.create.fields.type')} *
              </label>
              <select
                id="type"
                required
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
              >
                {availableTypes.map((type) => (
                  <option key={type} value={type}>
                    {t(`events.types.${type}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Team Selection (if type is team) */}
          {formData.type === 'team' && selectedClub && selectedClub.teams && selectedClub.teams.length > 0 && (
            <div>
              <label htmlFor="teamId" className="block text-sm font-medium text-gray-700 mb-2">
                {t('events.create.fields.team')} *
              </label>
              <select
                id="teamId"
                required
                value={formData.teamId}
                onChange={(e) => setFormData({ ...formData, teamId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
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

          {/* Date & Time */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
                {t('events.create.fields.date')} *
              </label>
              <input
                type="date"
                id="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
              />
            </div>

            <div>
              <label htmlFor="startTime" className="block text-sm font-medium text-gray-700 mb-2">
                {t('events.create.fields.startTime')}
              </label>
              <input
                type="time"
                id="startTime"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
              />
            </div>

            <div>
              <label htmlFor="endTime" className="block text-sm font-medium text-gray-700 mb-2">
                {t('events.create.fields.endTime')}
              </label>
              <input
                type="time"
                id="endTime"
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
              />
            </div>
          </div>

          {/* Location */}
          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-2">
              {t('events.create.fields.location')}
            </label>
            <input
              type="text"
              id="location"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
              placeholder={t('events.create.placeholders.location')}
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              {t('events.create.fields.description')}
            </label>
            <textarea
              id="description"
              rows={4}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
              placeholder={t('events.create.placeholders.description')}
            />
          </div>

          {/* RSVP Settings */}
          <div className="space-y-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="rsvpRequired"
                checked={formData.rsvpRequired}
                onChange={(e) => setFormData({ ...formData, rsvpRequired: e.target.checked })}
                className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
              />
              <label htmlFor="rsvpRequired" className="ml-2 text-sm text-gray-700">
                {t('events.create.fields.rsvpRequired')}
              </label>
            </div>

            {formData.rsvpRequired && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-6">
                <div>
                  <label htmlFor="rsvpDeadline" className="block text-sm font-medium text-gray-700 mb-2">
                    {t('events.create.fields.rsvpDeadline')}
                  </label>
                  <input
                    type="datetime-local"
                    id="rsvpDeadline"
                    value={formData.rsvpDeadline}
                    onChange={(e) => setFormData({ ...formData, rsvpDeadline: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                  />
                </div>

                <div>
                  <label htmlFor="maxParticipants" className="block text-sm font-medium text-gray-700 mb-2">
                    {t('events.create.fields.maxParticipants')}
                  </label>
                  <input
                    type="number"
                    id="maxParticipants"
                    min="1"
                    value={formData.maxParticipants}
                    onChange={(e) => setFormData({ ...formData, maxParticipants: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                    placeholder={t('events.create.placeholders.maxParticipants')}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Submit Buttons */}
          <div className="flex items-center justify-end space-x-4">
            <button
              type="button"
              onClick={() => navigate('/calendar')}
              className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('common.creating') : t('events.create.submit')}
            </button>
          </div>
        </form>
      </div>
    </Container>
  );
}

