/**
 * Create Order Page
 * Dynamic form builder for creating custom orders
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { createOrder } from '../../services/firebase/orders';
import { getUserClubs, getClub } from '../../services/firebase/clubs';
import { Timestamp } from 'firebase/firestore';
import type { OrderField, OrderFieldType } from '../../types';

export default function CreateOrder() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [userClubs, setUserClubs] = useState<Array<{ id: string; name: string }>>([]);
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);

  // Form state
  const [clubId, setClubId] = useState('');
  const [targetAudience, setTargetAudience] = useState<'club' | 'team'>('club');
  const [teamId, setTeamId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineHour, setDeadlineHour] = useState('12');
  const [deadlineMinute, setDeadlineMinute] = useState('00');
  const [fields, setFields] = useState<OrderField[]>([]);

  // Load clubs
  useEffect(() => {
    if (!user) return;

    const loadClubs = async () => {
      try {
        const clubs = await getUserClubs(user.id);
        setUserClubs(clubs.map(c => ({ id: c.id!, name: c.name })));
        if (clubs.length > 0) {
          setClubId(clubs[0].id!);
        }
      } catch (error) {
        console.error('Error loading clubs:', error);
      }
    };

    loadClubs();
  }, [user]);

  // Load teams when club is selected
  useEffect(() => {
    if (!clubId) return;

    const loadTeams = async () => {
      try {
        const club = await getClub(clubId);
        if (club && club.teams) {
          setTeams(club.teams.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })));
        }
      } catch (error) {
        console.error('Error loading teams:', error);
      }
    };

    loadTeams();
  }, [clubId]);

  // Add new field
  const addField = () => {
    const newField: OrderField = {
      id: `field_${Date.now()}`,
      label: '',
      type: 'text',
      required: false,
      order: fields.length,
    };
    setFields([...fields, newField]);
  };

  // Update field
  const updateField = (index: number, updates: Partial<OrderField>) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], ...updates };
    setFields(newFields);
  };

  // Remove field
  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  // Move field up/down
  const moveField = (index: number, direction: 'up' | 'down') => {
    const newFields = [...fields];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newFields.length) return;
    
    [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
    newFields[index].order = index;
    newFields[targetIndex].order = targetIndex;
    
    setFields(newFields);
  };

  // Add option to select field
  const addOption = (index: number) => {
    const newFields = [...fields];
    if (!newFields[index].options) {
      newFields[index].options = [];
    }
    newFields[index].options!.push('');
    setFields(newFields);
  };

  // Update option
  const updateOption = (fieldIndex: number, optionIndex: number, value: string) => {
    const newFields = [...fields];
    if (newFields[fieldIndex].options) {
      newFields[fieldIndex].options![optionIndex] = value;
      setFields(newFields);
    }
  };

  // Remove option
  const removeOption = (fieldIndex: number, optionIndex: number) => {
    const newFields = [...fields];
    if (newFields[fieldIndex].options) {
      newFields[fieldIndex].options!.splice(optionIndex, 1);
      setFields(newFields);
    }
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !clubId || !title || !deadlineDate || !deadlineHour || !deadlineMinute || fields.length === 0) {
      alert(t('orders.fillRequired'));
      return;
    }

    // Validate fields
    for (const field of fields) {
      if (!field.label.trim()) {
        alert(t('orders.fieldLabelRequired'));
        return;
      }
      if (field.type === 'select' && (!field.options || field.options.length === 0)) {
        alert(t('orders.selectOptionsRequired'));
        return;
      }
    }

    setLoading(true);
    try {
      // Combine date, hour, and minute into 24h format time string
      const timeString = `${deadlineHour.padStart(2, '0')}:${deadlineMinute.padStart(2, '0')}`;
      const deadlineDateTime = new Date(`${deadlineDate}T${timeString}`);
      
      const orderData = {
        clubId,
        teamId: targetAudience === 'team' ? teamId : undefined,
        createdBy: user.id,
        creatorName: user.displayName,
        creatorRole: user.role === 'clubOwner' ? 'clubOwner' as const : 
                     user.role === 'trainer' ? 'trainer' as const : 
                     'assistant' as const,
        title: title.trim(),
        description: description.trim(),
        deadline: Timestamp.fromDate(deadlineDateTime),
        status: 'active' as const,
        fields,
        targetAudience,
      };

      const orderId = await createOrder(orderData);
      navigate(`/orders/${orderId}`);
    } catch (error) {
      console.error('Error creating order:', error);
      alert(t('orders.createError'));
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return null;
  }

  const fieldTypes: { value: OrderFieldType; label: string }[] = [
    { value: 'text', label: t('orders.fieldTypes.text') },
    { value: 'number', label: t('orders.fieldTypes.number') },
    { value: 'select', label: t('orders.fieldTypes.select') },
    { value: 'textarea', label: t('orders.fieldTypes.textarea') },
    { value: 'date', label: t('orders.fieldTypes.date') },
    { value: 'file', label: t('orders.fieldTypes.file') },
  ];

  return (
    <Container>
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-text-primary">
            {t('orders.createOrder')}
          </h1>
          <button
            type="button"
            onClick={() => navigate('/orders')}
            className="text-text-secondary hover:text-text-primary"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Basic Information */}
        <div className="bg-app-card rounded-xl border border-white/10 p-6 space-y-4">
          <h2 className="text-xl font-bold text-text-primary mb-4">
            {t('orders.basicInfo')}
          </h2>

          {/* Club Selection */}
          {userClubs.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('orders.selectClub')} *
              </label>
              <select
                value={clubId}
                onChange={(e) => setClubId(e.target.value)}
                required
                className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
              >
                {userClubs.map((club) => (
                  <option key={club.id} value={club.id}>
                    {club.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Target Audience */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {t('orders.targetAudience')} *
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="club"
                  checked={targetAudience === 'club'}
                  onChange={(e) => setTargetAudience(e.target.value as 'club' | 'team')}
                  className="w-4 h-4 text-app-cyan focus:ring-app-cyan/50"
                />
                <span className="text-text-primary">{t('orders.wholeClub')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="team"
                  checked={targetAudience === 'team'}
                  onChange={(e) => setTargetAudience(e.target.value as 'club' | 'team')}
                  className="w-4 h-4 text-app-cyan focus:ring-app-cyan/50"
                />
                <span className="text-text-primary">{t('orders.specificTeam')}</span>
              </label>
            </div>
          </div>

          {/* Team Selection (if target is team) */}
          {targetAudience === 'team' && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('orders.selectTeam')} *
              </label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                required={targetAudience === 'team'}
                className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
              >
                <option value="">{t('orders.chooseTeam')}</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {t('orders.orderTitle')} *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('orders.orderTitlePlaceholder')}
              required
              className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {t('orders.description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('orders.descriptionPlaceholder')}
              rows={3}
              className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
            />
          </div>

          {/* Deadline */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('orders.deadlineDate')} *
              </label>
              <input
                type="date"
                value={deadlineDate}
                onChange={(e) => setDeadlineDate(e.target.value)}
                required
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('orders.hour')} * (0-23)
              </label>
              <select
                value={deadlineHour}
                onChange={(e) => setDeadlineHour(e.target.value)}
                required
                className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i.toString()}>
                    {i.toString().padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('orders.minute')} * (0-59)
              </label>
              <select
                value={deadlineMinute}
                onChange={(e) => setDeadlineMinute(e.target.value)}
                required
                className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
              >
                {Array.from({ length: 12 }, (_, i) => i * 5).map((min) => (
                  <option key={min} value={min.toString().padStart(2, '0')}>
                    {min.toString().padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Dynamic Fields Builder */}
        <div className="bg-app-card rounded-xl border border-white/10 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-text-primary">
              {t('orders.customFields')}
            </h2>
            <button
              type="button"
              onClick={addField}
              className="px-4 py-2 bg-app-blue/20 border border-app-cyan/30 text-app-cyan rounded-lg hover:bg-app-blue/30 transition-all"
            >
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {t('orders.addField')}
              </span>
            </button>
          </div>

          {fields.length === 0 ? (
            <div className="text-center py-8 text-text-muted">
              <p>{t('orders.noFieldsYet')}</p>
              <p className="text-sm mt-2">{t('orders.addFieldHint')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {fields.map((field, index) => (
                <div key={field.id} className="bg-app-secondary rounded-lg border border-white/10 p-3">
                  {/* Single Line Layout */}
                  <div className="flex items-center gap-2">
                    {/* Field Number */}
                    <span className="text-xs font-medium text-text-muted min-w-[30px]">
                      #{index + 1}
                    </span>

                    {/* Label Input */}
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) => updateField(index, { label: e.target.value })}
                      placeholder="Label"
                      className="flex-1 px-3 py-2 bg-app-primary border border-white/10 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
                    />

                    {/* Type Dropdown */}
                    <select
                      value={field.type}
                      onChange={(e) => updateField(index, { type: e.target.value as OrderFieldType })}
                      className="w-32 px-2 py-2 bg-app-primary border border-white/10 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
                    >
                      {fieldTypes.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>

                    {/* Required Checkbox */}
                    <label className="flex items-center gap-1 cursor-pointer whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => updateField(index, { required: e.target.checked })}
                        className="w-4 h-4 text-app-cyan focus:ring-app-cyan/50 rounded"
                      />
                      <span className="text-xs text-text-muted">Req</span>
                    </label>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveField(index, 'up')}
                        disabled={index === 0}
                        className="p-1 text-text-muted hover:text-text-primary disabled:opacity-30"
                        title="Move up"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => moveField(index, 'down')}
                        disabled={index === fields.length - 1}
                        className="p-1 text-text-muted hover:text-text-primary disabled:opacity-30"
                        title="Move down"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeField(index)}
                        className="p-1 text-red-400 hover:text-red-300"
                        title="Remove"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Options (for dropdown type) - Collapsible */}
                  {field.type === 'select' && (
                    <div className="mt-2 pl-8 space-y-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-text-muted">{t('orders.options')}:</span>
                        <button
                          type="button"
                          onClick={() => addOption(index)}
                          className="text-xs text-app-cyan hover:text-app-cyan/80"
                        >
                          + Add
                        </button>
                      </div>
                      {field.options?.map((option, optionIndex) => (
                        <div key={optionIndex} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={option}
                            onChange={(e) => updateOption(index, optionIndex, e.target.value)}
                            placeholder={`Option ${optionIndex + 1}`}
                            className="flex-1 px-2 py-1 bg-app-primary border border-white/10 rounded text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-app-cyan/50"
                          />
                          <button
                            type="button"
                            onClick={() => removeOption(index, optionIndex)}
                            className="p-1 text-red-400 hover:text-red-300"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate('/orders')}
            className="px-6 py-3 bg-app-secondary border border-white/10 text-white rounded-lg hover:bg-white/10 transition-all"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={loading || fields.length === 0}
            className="px-6 py-3 bg-gradient-primary text-white rounded-lg hover:shadow-button-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('common.loading') : t('orders.publishOrder')}
          </button>
        </div>
      </form>
    </Container>
  );
}
