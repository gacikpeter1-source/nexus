/**
 * Subscription tab (Club Settings) — shows the club's current subscription
 * status/expiry and lets the owner redeem a voucher code to extend it.
 * Owner-only (and admin) since this affects billing/subscription state,
 * not just club configuration — gated by the parent ClubSettings page's
 * access check, same as the Danger Zone.
 */

import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { updateClub } from '../../services/firebase/clubs';
import { getVoucherByCode, redeemVoucher } from '../../services/firebase/vouchers';
import type { Club } from '../../types';

interface Props {
  club: Club;
  onUpdate: () => void;
}

export default function SubscriptionManagement({ club, onUpdate }: Props) {
  const { user } = useAuth();
  const { t } = useLanguage();

  const [voucherCode, setVoucherCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isOwner = !!user && (club.ownerId === user.id || user.role === 'admin');

  const expiryDate = club.subscriptionExpiryDate ? new Date(club.subscriptionExpiryDate) : null;
  const isExpired = !club.subscriptionActive || (expiryDate ? expiryDate.getTime() < Date.now() : false);

  const handleRedeem = async () => {
    if (!user) return;
    const code = voucherCode.trim();
    if (!code) return;

    setError('');
    setSuccess('');
    setRedeeming(true);
    try {
      const voucher = await getVoucherByCode(code);

      if (!voucher) {
        setError(t('clubs.create.invalidVoucher'));
        return;
      }
      if (voucher.status !== 'active') {
        setError(t('clubs.create.voucherNotActive'));
        return;
      }
      if (voucher.usedCount >= voucher.maxUses) {
        setError(t('clubs.create.voucherMaxUses'));
        return;
      }
      if (voucher.expirationDate && new Date(voucher.expirationDate) < new Date()) {
        setError(t('clubs.create.voucherExpired'));
        return;
      }

      try {
        await redeemVoucher({ voucherId: voucher.id, userId: user.id, clubId: club.id, note: `Extend: ${club.name}` });
      } catch (redeemErr) {
        console.error('SubscriptionManagement: redeem failed', redeemErr);
        setError(t('clubs.create.voucherMaxUses'));
        return;
      }

      const durationDays = voucher.isPermanent ? 365 * 100 : voucher.duration || 365;
      // Extend from whichever is later — the current expiry (if the
      // subscription is still active) or now (if it already lapsed) —
      // so an early renewal never throws away remaining paid time.
      const baseDate = !isExpired && expiryDate ? expiryDate : new Date();
      const newExpiry = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

      await updateClub(club.id!, {
        subscriptionActive: true,
        subscriptionType: 'voucher',
        subscriptionExpiryDate: newExpiry.toISOString(),
      });

      setVoucherCode('');
      setSuccess(t('clubs.settings.subscription.redeemSuccess', { date: newExpiry.toLocaleDateString() }));
      onUpdate();
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-app-secondary rounded-xl border border-white/10 p-4 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">{t('clubs.settings.subscription.status')}</span>
          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
            isExpired ? 'bg-chart-pink/20 text-chart-pink' : 'bg-chart-cyan/20 text-chart-cyan'
          }`}>
            {isExpired ? t('clubs.status.expired') : t('clubs.status.active')}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">{t('clubs.settings.subscription.type')}</span>
          <span className="text-sm text-text-primary">{t(`clubs.subscription.${club.subscriptionType}`)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">{t('clubs.subscription.expiresOn')}</span>
          <span className="text-sm text-text-primary">
            {expiryDate ? expiryDate.toLocaleDateString() : '—'}
          </span>
        </div>
      </div>

      {isOwner ? (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-text-secondary">
            {t('clubs.settings.subscription.redeemLabel')}
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={voucherCode}
              onChange={e => setVoucherCode(e.target.value.toUpperCase())}
              maxLength={10}
              placeholder={t('clubs.create.placeholders.voucher')}
              className="flex-1 px-4 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
            />
            <button
              onClick={handleRedeem}
              disabled={redeeming || !voucherCode.trim()}
              className="px-5 py-2.5 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover transition-all font-semibold disabled:opacity-50"
            >
              {redeeming ? t('common.loading') : t('clubs.settings.subscription.redeemButton')}
            </button>
          </div>
          {error && <p className="text-sm text-chart-pink">{error}</p>}
          {success && <p className="text-sm text-chart-cyan">{success}</p>}
        </div>
      ) : (
        <p className="text-sm text-text-muted">{t('clubs.settings.subscription.ownerOnly')}</p>
      )}
    </div>
  );
}
