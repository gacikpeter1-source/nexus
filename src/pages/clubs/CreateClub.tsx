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
      let subscriptionType: 'voucher' | 'trial' = 'trial';
      let subscriptionDuration = 30; // days
      const code = formData.voucherCode.trim();

      // Validate + redeem the voucher BEFORE creating the club, so a club
      // is only ever marked subscriptionType:'voucher' once redemption has
      // actually, atomically succeeded — redeeming after club creation (the
      // old order) meant a redemption that lost a race (someone else used
      // the same code a moment earlier) was silently swallowed, leaving the
      // new club mislabeled as voucher-backed with no real redemption
      // behind it. Firestore rules already enforce the single-use
      // guarantee itself (usedCount can only ever be written as exactly
      // +1 of the current server value), this just makes the UI honest
      // about whether that succeeded.
      if (code) {
        const voucher = await getVoucherByCode(code);

        if (!voucher) {
          setError(t('clubs.create.invalidVoucher'));
          setLoading(false);
          return;
        }
        if (voucher.status !== 'active') {
          setError(t('clubs.create.voucherNotActive'));
          setLoading(false);
          return;
        }
        if (voucher.usedCount >= voucher.maxUses) {
          setError(t('clubs.create.voucherMaxUses'));
          setLoading(false);
          return;
        }
        if (voucher.expirationDate && new Date(voucher.expirationDate) < new Date()) {
          setError(t('clubs.create.voucherExpired'));
          setLoading(false);
          return;
        }

        try {
          await redeemVoucher({
            voucherId: voucher.id,
            userId: user.id,
            note: `Club: ${formData.name}`,
          });
        } catch (redeemError) {
          // Someone else redeemed it in the moment between our check and
          // our write, or another server-side rule rejected it — either
          // way the voucher is no longer usable by us.
          console.error('Error redeeming voucher:', redeemError);
          setError(t('clubs.create.voucherMaxUses'));
          setLoading(false);
          return;
        }

        subscriptionType = 'voucher';
        subscriptionDuration = voucher.isPermanent
          ? 365 * 100 // "permanent" ~= 100 years
          : voucher.duration || 365;
      }

      // Create the club
      const clubId = await createClub({
        name: formData.name,
        clubType: formData.clubType,
        description: formData.description,
        ownerId: user.id,
        subscriptionActive: true,
        subscriptionType,
        voucherCode: subscriptionType === 'voucher' ? code : undefined,
        subscriptionExpiryDate: new Date(Date.now() + subscriptionDuration * 24 * 60 * 60 * 1000).toISOString(),
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


