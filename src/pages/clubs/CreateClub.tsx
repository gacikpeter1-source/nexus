/**
 * Create Club Page
 * Form for creating a new club with subscription
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { createClub } from '../../services/firebase/clubs';

export default function CreateClub() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    clubType: 'sports',
    description: '',
    voucherCode: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      setError(t('clubs.create.notLoggedIn'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Validate voucher code (mock validation for now)
      const isValidVoucher = formData.voucherCode.length === 6;

      if (!isValidVoucher && formData.voucherCode !== '') {
        setError(t('clubs.create.invalidVoucher'));
        setLoading(false);
        return;
      }

      const clubId = await createClub({
        name: formData.name,
        clubType: formData.clubType,
        description: formData.description,
        ownerId: user.id,
        subscriptionActive: isValidVoucher || formData.voucherCode === '',
        subscriptionType: isValidVoucher ? 'voucher' : 'trial',
        voucherCode: formData.voucherCode || undefined,
        subscriptionExpiryDate: isValidVoucher
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days trial
      });

      navigate(`/clubs/${clubId}`);
    } catch (err) {
      console.error('Error creating club:', err);
      setError(t('clubs.create.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="max-w-2xl">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {t('clubs.create.title')}
          </h1>
          <p className="mt-2 text-gray-600">
            {t('clubs.create.subtitle')}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white shadow-sm rounded-lg border border-gray-200 p-6 space-y-6">
          {/* Club Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              {t('clubs.create.fields.name')} *
            </label>
            <input
              type="text"
              id="name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
              placeholder={t('clubs.create.placeholders.name')}
            />
          </div>

          {/* Club Type */}
          <div>
            <label htmlFor="clubType" className="block text-sm font-medium text-gray-700 mb-2">
              {t('clubs.create.fields.type')} *
            </label>
            <select
              id="clubType"
              value={formData.clubType}
              onChange={(e) => setFormData({ ...formData, clubType: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
            >
              <option value="sports">{t('clubs.types.sports')}</option>
              <option value="education">{t('clubs.types.education')}</option>
              <option value="arts">{t('clubs.types.arts')}</option>
              <option value="community">{t('clubs.types.community')}</option>
              <option value="other">{t('clubs.types.other')}</option>
            </select>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              {t('clubs.create.fields.description')}
            </label>
            <textarea
              id="description"
              rows={4}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
              placeholder={t('clubs.create.placeholders.description')}
            />
          </div>

          {/* Voucher Code */}
          <div>
            <label htmlFor="voucherCode" className="block text-sm font-medium text-gray-700 mb-2">
              {t('clubs.create.fields.voucher')}
            </label>
            <input
              type="text"
              id="voucherCode"
              value={formData.voucherCode}
              onChange={(e) => setFormData({ ...formData, voucherCode: e.target.value.toUpperCase() })}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
              placeholder={t('clubs.create.placeholders.voucher')}
              maxLength={10}
            />
            <p className="mt-1 text-sm text-gray-500">
              {t('clubs.create.voucherHelp')}
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <p className="text-sm text-blue-800">
              <strong>{t('clubs.create.info.title')}:</strong>{' '}
              {t('clubs.create.info.description')}
            </p>
          </div>

          {/* Submit Buttons */}
          <div className="flex items-center justify-end space-x-4">
            <button
              type="button"
              onClick={() => navigate('/clubs')}
              className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('common.creating') : t('clubs.create.submit')}
            </button>
          </div>
        </form>
      </div>
    </Container>
  );
}

