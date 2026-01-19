import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { updateClub } from '../../services/firebase/clubs';
import type { Club } from '../../types';

interface CustomFieldsManagementProps {
  club: Club;
  onUpdate: () => void;
}

type FieldType = 'text' | 'number' | 'date' | 'select';

interface CustomField {
  label: string;
  type: FieldType;
  options?: string[];
  required: boolean;
  visible: boolean;
}

export default function CustomFieldsManagement({ club, onUpdate }: CustomFieldsManagementProps) {
  const { t } = useLanguage();
  const [fields, setFields] = useState<{ [key: string]: CustomField }>(club.memberCardFields || {});
  const [showForm, setShowForm] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    fieldKey: '',
    label: '',
    type: 'text' as FieldType,
    options: '',
    required: false,
    visible: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newFields = { ...fields };
    const fieldKey = editingKey || formData.fieldKey;

    newFields[fieldKey] = {
      label: formData.label,
      type: formData.type,
      options: formData.type === 'select' ? formData.options.split(',').map(o => o.trim()) : undefined,
      required: formData.required,
      visible: formData.visible,
    };

    try {
      await updateClub(club.id!, { memberCardFields: newFields });
      alert(t('clubs.settings.customFields.saveSuccess'));
      setFields(newFields);
      setShowForm(false);
      setEditingKey(null);
      resetForm();
      onUpdate();
    } catch (error) {
      console.error('Error saving custom fields:', error);
      alert(t('clubs.settings.customFields.saveError'));
    }
  };

  const handleEdit = (key: string, field: CustomField) => {
    setEditingKey(key);
    setFormData({
      fieldKey: key,
      label: field.label,
      type: field.type,
      options: field.options?.join(', ') || '',
      required: field.required,
      visible: field.visible,
    });
    setShowForm(true);
  };

  const handleDelete = async (key: string) => {
    if (confirm(t('clubs.settings.customFields.confirmDelete'))) {
      const newFields = { ...fields };
      delete newFields[key];

      try {
        await updateClub(club.id!, { memberCardFields: newFields });
        alert(t('clubs.settings.customFields.saveSuccess'));
        setFields(newFields);
        onUpdate();
      } catch (error) {
        console.error('Error deleting field:', error);
        alert(t('clubs.settings.customFields.saveError'));
      }
    }
  };

  const resetForm = () => {
    setFormData({
      fieldKey: '',
      label: '',
      type: 'text',
      options: '',
      required: false,
      visible: true,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">{t('clubs.settings.customFields.title')}</h3>
          <p className="text-sm text-text-secondary mt-1">{t('clubs.settings.customFields.description')}</p>
        </div>

        <button
          onClick={() => {
            setShowForm(!showForm);
            if (showForm) {
              setEditingKey(null);
              resetForm();
            }
          }}
          className="px-6 py-3 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold"
        >
          {showForm ? t('common.cancel') : t('clubs.settings.customFields.addField')}
        </button>
      </div>

      {/* Field Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-app-secondary border border-white/10 rounded-xl p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('clubs.settings.customFields.fields.fieldKey')}
              </label>
              <input
                type="text"
                value={formData.fieldKey}
                onChange={(e) => setFormData({ ...formData, fieldKey: e.target.value.toLowerCase().replace(/\s/g, '') })}
                placeholder={t('clubs.settings.customFields.placeholders.fieldKey')}
                className="w-full px-4 py-2 bg-app-card border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
                required
                disabled={!!editingKey}
              />
              <p className="text-xs text-text-muted mt-1">{t('clubs.settings.customFields.keyHelp')}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('clubs.settings.customFields.fields.label')}
              </label>
              <input
                type="text"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                placeholder={t('clubs.settings.customFields.placeholders.label')}
                className="w-full px-4 py-2 bg-app-card border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('clubs.settings.customFields.fields.type')}
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as FieldType })}
                className="w-full px-4 py-2 bg-app-card border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
              >
                <option value="text">{t('clubs.settings.customFields.types.text')}</option>
                <option value="number">{t('clubs.settings.customFields.types.number')}</option>
                <option value="date">{t('clubs.settings.customFields.types.date')}</option>
                <option value="select">{t('clubs.settings.customFields.types.select')}</option>
              </select>
            </div>

            {formData.type === 'select' && (
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  {t('clubs.settings.customFields.fields.options')}
                </label>
                <input
                  type="text"
                  value={formData.options}
                  onChange={(e) => setFormData({ ...formData, options: e.target.value })}
                  placeholder={t('clubs.settings.customFields.placeholders.options')}
                  className="w-full px-4 py-2 bg-app-card border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
                />
                <p className="text-xs text-text-muted mt-1">{t('clubs.settings.customFields.optionsHelp')}</p>
              </div>
            )}

            <div className="md:col-span-2 space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={formData.required}
                  onChange={(e) => setFormData({ ...formData, required: e.target.checked })}
                  className="w-4 h-4 text-app-blue rounded border-gray-300 focus:ring-app-blue"
                />
                <span className="text-sm text-text-secondary">{t('clubs.settings.customFields.fields.required')}</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={formData.visible}
                  onChange={(e) => setFormData({ ...formData, visible: e.target.checked })}
                  className="w-4 h-4 text-app-blue rounded border-gray-300 focus:ring-app-blue"
                />
                <span className="text-sm text-text-secondary">{t('clubs.settings.customFields.fields.visible')}</span>
              </label>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-primary text-white font-semibold px-8 py-4 rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300"
          >
            {editingKey ? t('common.update') : t('common.create')}
          </button>
        </form>
      )}

      {/* Fields List */}
      {Object.keys(fields).length === 0 ? (
        <div className="text-center py-12">
          <p className="text-text-secondary mb-2">{t('clubs.settings.customFields.noFields')}</p>
          <p className="text-sm text-text-muted">{t('clubs.settings.customFields.noFieldsDescription')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(fields).map(([key, field]) => (
            <div
              key={key}
              className="flex items-center justify-between p-4 bg-app-secondary border border-white/10 rounded-xl hover:border-app-blue transition-all"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h4 className="font-semibold text-text-primary">{field.label}</h4>
                  <span className="px-2 py-1 text-xs bg-app-blue/20 text-app-cyan rounded-full font-semibold">
                    {t(`clubs.settings.customFields.types.${field.type}`)}
                  </span>
                  {field.required && (
                    <span className="px-2 py-1 text-xs bg-chart-pink/20 text-chart-pink rounded-full font-semibold">
                      {t('clubs.settings.customFields.fields.required')}
                    </span>
                  )}
                </div>
                <p className="text-sm text-text-muted mt-1">Key: {key}</p>
                {field.options && (
                  <p className="text-xs text-text-muted mt-1">Options: {field.options.join(', ')}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEdit(key, field)}
                  className="p-2 text-app-cyan hover:bg-white/5 rounded-lg transition-all"
                  title={t('common.edit')}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(key)}
                  className="p-2 text-chart-pink hover:bg-white/5 rounded-lg transition-all"
                  title={t('common.delete')}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


