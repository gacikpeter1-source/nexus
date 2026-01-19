import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { updateClub } from '../../services/firebase/clubs';
import type { Club } from '../../types';

interface GeneralSettingsProps {
  club: Club;
  onUpdate: () => void;
}

export default function GeneralSettings({ club, onUpdate }: GeneralSettingsProps) {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({
    name: club.name,
    description: club.description || '',
    contactEmail: club.contactEmail || '',
    contactPhone: club.contactPhone || '',
    address: club.address || '',
    website: club.website || '',
    logoURL: club.logoURL || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      await updateClub(club.id!, formData);
      alert(t('clubs.settings.general.saveSuccess'));
      onUpdate();
    } catch (error) {
      console.error('Error updating club:', error);
      alert(t('clubs.settings.general.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h3 className="text-lg font-semibold text-text-primary mb-4">
        {t('clubs.settings.general.title')}
      </h3>

      {/* Club Info */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            {t('clubs.settings.general.clubName')}
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            {t('clubs.settings.general.description')}
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
            className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
          />
        </div>
      </div>

      {/* Contact Info */}
      <div className="space-y-4">
        <h4 className="text-md font-semibold text-text-primary">{t('clubs.settings.general.contactInfo')}</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {t('clubs.settings.general.contactEmail')}
            </label>
            <input
              type="email"
              value={formData.contactEmail}
              onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
              placeholder={t('clubs.settings.general.placeholders.email')}
              className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {t('clubs.settings.general.contactPhone')}
            </label>
            <input
              type="tel"
              value={formData.contactPhone}
              onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
              placeholder={t('clubs.settings.general.placeholders.phone')}
              className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {t('clubs.settings.general.address')}
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder={t('clubs.settings.general.placeholders.address')}
              className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {t('clubs.settings.general.website')}
            </label>
            <input
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              placeholder={t('clubs.settings.general.placeholders.website')}
              className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
            />
          </div>
        </div>
      </div>

      {/* Logo */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          {t('clubs.settings.general.logoUrl')}
        </label>
        <input
          type="url"
          value={formData.logoURL}
          onChange={(e) => setFormData({ ...formData, logoURL: e.target.value })}
          placeholder={t('clubs.settings.general.placeholders.logoUrl')}
          className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
        />
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={saving}
        className="w-full bg-gradient-primary text-white font-semibold px-8 py-4 rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300"
      >
        {saving ? t('common.saving') : t('common.save')}
      </button>
    </form>
  );
}


