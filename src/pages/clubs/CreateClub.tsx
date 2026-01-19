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
import { getVoucherByCode, redeemVoucher } from '../../services/firebase/vouchers';

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
      let isValidVoucher = false;
      let subscriptionDuration = 30; // days

      // Validate voucher code if provided
      if (formData.voucherCode.trim()) {
        const voucher = await getVoucherByCode(formData.voucherCode.trim());

        if (!voucher) {
          setError(t('clubs.create.invalidVoucher'));
          setLoading(false);
          return;
        }

        // Check voucher status
        if (voucher.status !== 'active') {
          setError(t('clubs.create.voucherNotActive'));
          setLoading(false);
          return;
        }

        // Check if voucher reached max uses
        if (voucher.usedCount >= voucher.maxUses) {
          setError(t('clubs.create.voucherMaxUses'));
          setLoading(false);
          return;
        }

        // Check expiration
        if (voucher.expirationDate && new Date(voucher.expirationDate) < new Date()) {
          setError(t('clubs.create.voucherExpired'));
          setLoading(false);
          return;
        }

        // Voucher is valid!
        isValidVoucher = true;
        
        // Calculate subscription duration
        if (voucher.isPermanent) {
          subscriptionDuration = 365 * 100; // 100 years for "permanent"
        } else if (voucher.duration) {
          subscriptionDuration = voucher.duration;
        } else {
          subscriptionDuration = 365; // default 1 year
        }
      }

      // Create the club
      const clubId = await createClub({
        name: formData.name,
        clubType: formData.clubType,
        description: formData.description,
        ownerId: user.id,
        subscriptionActive: true,
        subscriptionType: isValidVoucher ? 'voucher' : 'trial',
        voucherCode: isValidVoucher ? formData.voucherCode : undefined,
        subscriptionExpiryDate: new Date(Date.now() + subscriptionDuration * 24 * 60 * 60 * 1000).toISOString(),
      });

      // Redeem the voucher if used
      if (isValidVoucher && formData.voucherCode) {
        try {
          const voucher = await getVoucherByCode(formData.voucherCode.trim());
          if (voucher) {
            await redeemVoucher({
              voucherId: voucher.id,
              userId: user.id,
              clubId: clubId,
              note: `Club: ${formData.name}`,
            });
          }
        } catch (voucherError) {
          console.error('Error redeeming voucher:', voucherError);
          // Don't fail club creation if voucher redemption fails
        }
      }

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
          <h1 className="text-3xl font-bold text-text-primary">
            {t('clubs.create.title')}
          </h1>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-app-card shadow-card rounded-2xl border border-white/10 p-6 space-y-6">
          {/* Club Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-text-secondary mb-2">
              {t('clubs.create.fields.name')} *
            </label>
            <input
              type="text"
              id="name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
              placeholder={t('clubs.create.placeholders.name')}
            />
          </div>

          {/* Club Type */}
          <div>
            <label htmlFor="clubType" className="block text-sm font-medium text-text-secondary mb-2">
              {t('clubs.create.fields.type')} *
            </label>
            <select
              id="clubType"
              value={formData.clubType}
              onChange={(e) => setFormData({ ...formData, clubType: e.target.value })}
              className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
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
            <label htmlFor="description" className="block text-sm font-medium text-text-secondary mb-2">
              {t('clubs.create.fields.description')}
            </label>
            <textarea
              id="description"
              rows={4}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
              placeholder={t('clubs.create.placeholders.description')}
            />
          </div>

          {/* Voucher Code */}
          <div>
            <label htmlFor="voucherCode" className="block text-sm font-medium text-text-secondary mb-2">
              {t('clubs.create.fields.voucher')}
            </label>
            <input
              type="text"
              id="voucherCode"
              value={formData.voucherCode}
              onChange={(e) => setFormData({ ...formData, voucherCode: e.target.value.toUpperCase() })}
              className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
              placeholder={t('clubs.create.placeholders.voucher')}
              maxLength={10}
            />
            <p className="mt-1 text-sm text-text-muted">
              {t('clubs.create.voucherHelp')}
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-chart-pink/20 border border-chart-pink/30 rounded-xl p-4">
              <p className="text-sm text-chart-pink font-medium">{error}</p>
            </div>
          )}

          {/* Info Box */}
          <div className="bg-app-blue/10 border border-app-blue/30 rounded-xl p-4">
            <p className="text-sm text-app-cyan">
              <strong>{t('clubs.create.info.title')}:</strong>{' '}
              {t('clubs.create.info.description')}
            </p>
          </div>

          {/* Submit Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => navigate('/clubs')}
              className="flex-1 px-6 py-3 bg-app-secondary border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all duration-300 font-semibold"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('common.creating') : t('clubs.create.submit')}
            </button>
          </div>
        </form>
      </div>
    </Container>
  );
}


