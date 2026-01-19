/**
 * Admin Panel
 * Manage vouchers and system settings
 * Mobile-first design
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Container from '../components/layout/Container';
import {
  createVoucher,
  getAllVouchers,
  updateVoucherStatus,
  deleteVoucher,
} from '../services/firebase/vouchers';
import type { Voucher } from '../types';

export default function AdminPanel() {
  const { user } = useAuth();
  const { t } = useLanguage();

  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [formData, setFormData] = useState({
    plan: 'trial' as 'trial' | 'user' | 'club' | 'full',
    duration: 365,
    isPermanent: false,
    maxUses: 1,
    expirationDate: '',
    description: '',
  });

  useEffect(() => {
    if (user?.role === 'admin') {
      loadVouchers();
    }
  }, [user]);

  const loadVouchers = async () => {
    setLoading(true);
    try {
      const allVouchers = await getAllVouchers();
      setVouchers(allVouchers);
    } catch (error) {
      console.error('Error loading vouchers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) return;

    setCreating(true);
    try {
      await createVoucher({
        plan: formData.plan,
        duration: formData.isPermanent ? undefined : formData.duration,
        isPermanent: formData.isPermanent,
        maxUses: formData.maxUses,
        expirationDate: formData.expirationDate || undefined,
        description: formData.description || undefined,
        createdBy: user.id,
      });

      // Reset form
      setFormData({
        plan: 'trial',
        duration: 365,
        isPermanent: false,
        maxUses: 1,
        expirationDate: '',
        description: '',
      });

      setShowCreateForm(false);
      loadVouchers();
      alert(t('admin.voucher.created'));
    } catch (error) {
      console.error('Error creating voucher:', error);
      alert(t('admin.voucher.error'));
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (voucherId: string, status: 'active' | 'expired' | 'disabled') => {
    try {
      await updateVoucherStatus(voucherId, status);
      loadVouchers();
    } catch (error) {
      console.error('Error updating voucher:', error);
    }
  };

  const handleDelete = async (voucherId: string) => {
    if (!confirm(t('admin.voucher.confirmDelete'))) return;

    try {
      await deleteVoucher(voucherId);
      loadVouchers();
    } catch (error) {
      console.error('Error deleting voucher:', error);
    }
  };

  // Check if user is admin
  if (user?.role !== 'admin') {
    return (
      <Container>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-text-primary mb-4">
            {t('admin.accessDenied')}
          </h1>
          <p className="text-text-secondary">{t('admin.adminOnly')}</p>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-text-primary">
            {t('admin.title')}
          </h1>
          
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 text-sm bg-gradient-primary text-white rounded-lg shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-medium whitespace-nowrap"
          >
            ➕ {t('admin.createVoucher')}
          </button>
        </div>

        {/* Create Voucher Form */}
        {showCreateForm && (
          <form
            onSubmit={handleCreateVoucher}
            className="bg-app-card shadow-card rounded-2xl border border-white/10 p-6 space-y-6"
          >
            <h2 className="text-xl font-semibold text-text-primary">
              {t('admin.newVoucher')}
            </h2>

            {/* Plan Selection */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('admin.plan')} *
              </label>
              <select
                value={formData.plan}
                onChange={(e) => setFormData({ ...formData, plan: e.target.value as any })}
                className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
                required
              >
                <option value="trial">{t('admin.plans.trial')}</option>
                <option value="user">{t('admin.plans.user')}</option>
                <option value="club">{t('admin.plans.club')}</option>
                <option value="full">{t('admin.plans.full')}</option>
              </select>
            </div>

            {/* Duration */}
            <div>
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={formData.isPermanent}
                  onChange={(e) => setFormData({ ...formData, isPermanent: e.target.checked })}
                  className="w-4 h-4 text-app-blue focus:ring-app-blue rounded"
                />
                <span className="text-sm font-medium text-text-secondary">
                  {t('admin.permanent')}
                </span>
              </label>

              {!formData.isPermanent && (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    {t('admin.duration')} ({t('admin.days')})
                  </label>
                  <input
                    type="number"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                    min="1"
                    className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
                  />
                </div>
              )}
            </div>

            {/* Max Uses */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('admin.maxUses')}
              </label>
              <input
                type="number"
                value={formData.maxUses}
                onChange={(e) => setFormData({ ...formData, maxUses: parseInt(e.target.value) })}
                min="1"
                className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
                required
              />
            </div>

            {/* Expiration Date */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('admin.expiresAt')} ({t('common.optional')})
              </label>
              <input
                type="date"
                value={formData.expirationDate}
                onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })}
                className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('admin.note')} ({t('common.optional')})
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder={t('admin.notePlaceholder')}
                className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
              />
            </div>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="flex-1 px-6 py-3 bg-app-secondary border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all duration-300 font-semibold"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={creating}
                className="flex-1 px-6 py-3 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? t('common.creating') : t('admin.createVoucher')}
              </button>
            </div>
          </form>
        )}

        {/* Vouchers List */}
        <div className="bg-app-card shadow-card rounded-2xl border border-white/10 p-6">
          <h2 className="text-xl font-semibold text-text-primary mb-4">
            {t('admin.vouchersList')}
          </h2>

          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-app-cyan mx-auto mb-4"></div>
              <p className="text-text-secondary">{t('common.loading')}</p>
            </div>
          ) : vouchers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-text-secondary">{t('admin.noVouchers')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {vouchers.map((voucher) => (
                <div
                  key={voucher.id}
                  className="bg-app-secondary border border-white/10 rounded-xl p-4 space-y-3"
                >
                  {/* Mobile-first layout */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      {/* Code */}
                      <div className="flex items-center gap-2">
                        <code className="text-2xl font-bold text-app-cyan tracking-wider">
                          {voucher.code}
                        </code>
                        <button
                          onClick={() => navigator.clipboard.writeText(voucher.code)}
                          className="p-1 hover:bg-white/10 rounded transition-colors"
                          title="Copy code"
                        >
                          <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>

                      {/* Info */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-muted">
                        <span className="capitalize">{voucher.plan}</span>
                        <span>•</span>
                        <span>{voucher.usedCount}/{voucher.maxUses} {t('admin.uses')}</span>
                        {voucher.isPermanent && (
                          <>
                            <span>•</span>
                            <span>{t('admin.permanent')}</span>
                          </>
                        )}
                      </div>

                      {/* Description */}
                      {voucher.description && (
                        <p className="text-sm text-text-secondary italic">
                          "{voucher.description}"
                        </p>
                      )}

                      {/* Status Badge */}
                      <span className={`inline-block px-3 py-1 text-xs font-semibold rounded-full ${
                        voucher.status === 'active' 
                          ? 'bg-chart-cyan/20 text-chart-cyan'
                          : voucher.status === 'expired'
                          ? 'bg-text-muted/20 text-text-muted'
                          : 'bg-chart-pink/20 text-chart-pink'
                      }`}>
                        {t(`admin.status.${voucher.status}`)}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex sm:flex-col gap-2">
                      {voucher.status === 'active' && (
                        <button
                          onClick={() => handleStatusChange(voucher.id, 'disabled')}
                          className="px-3 py-2 text-xs bg-chart-pink/20 text-chart-pink rounded-lg hover:bg-chart-pink/30 transition-colors whitespace-nowrap"
                        >
                          {t('admin.disable')}
                        </button>
                      )}
                      {voucher.status === 'disabled' && (
                        <button
                          onClick={() => handleStatusChange(voucher.id, 'active')}
                          className="px-3 py-2 text-xs bg-chart-cyan/20 text-chart-cyan rounded-lg hover:bg-chart-cyan/30 transition-colors whitespace-nowrap"
                        >
                          {t('admin.enable')}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(voucher.id)}
                        className="px-3 py-2 text-xs bg-white/5 text-text-muted rounded-lg hover:bg-white/10 hover:text-chart-pink transition-colors whitespace-nowrap"
                      >
                        {t('admin.delete')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}

