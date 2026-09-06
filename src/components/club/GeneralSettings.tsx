import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { updateClub } from '../../services/firebase/clubs';
import { uploadClubLogo } from '../../services/firebase/logos';
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
  });
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [cardStyle, setCardStyle] = useState<'avatar' | 'background'>(club.cardStyle || 'avatar');

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

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file later
    if (!file || !club.id) return;

    setLogoError('');
    setUploadingLogo(true);
    try {
      await uploadClubLogo(club.id, file);
      onUpdate();
    } catch (error: any) {
      console.error('Error uploading club logo:', error);
      setLogoError(error?.message || t('clubs.settings.general.logoUploadError'));
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleCardStyleChange = async (style: 'avatar' | 'background') => {
    setCardStyle(style);
    if (!club.id) return;
    try {
      await updateClub(club.id, { cardStyle: style });
      onUpdate();
    } catch (error) {
      console.error('Error updating card style:', error);
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
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            {t('clubs.settings.general.logo')}
          </label>
          <div className="flex items-center gap-4">
            {club.logoURL ? (
              <img
                src={club.logoURL}
                alt={club.name}
                className="w-16 h-16 rounded-full object-cover border-2 border-app-blue flex-shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-primary flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
                {club.name.charAt(0).toUpperCase()}
              </div>
            )}
            <label className="px-4 py-2 bg-app-secondary border border-white/10 rounded-xl text-text-primary text-sm font-medium cursor-pointer hover:bg-white/10 transition-all">
              {uploadingLogo ? t('common.saving') : t('clubs.settings.general.uploadLogo')}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleLogoChange}
                disabled={uploadingLogo}
                className="hidden"
              />
            </label>
          </div>
          {logoError && <p className="text-xs text-chart-pink mt-2">{logoError}</p>}
        </div>

        {club.logoURL && (
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {t('clubs.settings.general.cardStyle')}
            </label>
            <div className="flex items-center gap-1 bg-app-secondary border border-white/10 rounded-xl p-1 max-w-xs">
              <button
                type="button"
                onClick={() => handleCardStyleChange('avatar')}
                className={`flex-1 px-3 py-2 text-xs sm:text-sm rounded-lg transition-all duration-300 font-semibold ${
                  cardStyle === 'avatar' ? 'bg-gradient-primary text-white shadow-button' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {t('clubs.settings.general.cardStyleAvatar')}
              </button>
              <button
                type="button"
                onClick={() => handleCardStyleChange('background')}
                className={`flex-1 px-3 py-2 text-xs sm:text-sm rounded-lg transition-all duration-300 font-semibold ${
                  cardStyle === 'background' ? 'bg-gradient-primary text-white shadow-button' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {t('clubs.settings.general.cardStyleBackground')}
              </button>
            </div>
            <p className="text-[11px] text-text-muted mt-1.5">{t('clubs.settings.general.cardStyleHint')}</p>
          </div>
        )}
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


