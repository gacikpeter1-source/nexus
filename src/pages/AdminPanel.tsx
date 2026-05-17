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
import {
  getUnverifiedUsers,
  deleteUnverifiedUser,
  deleteMultipleUnverifiedUsers,
  type UnverifiedUser,
} from '../services/firebase/adminUsers';
import type { Voucher } from '../types';

export default function AdminPanel() {
  const { user } = useAuth();
  const { t } = useLanguage();

  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  
  // Unverified users state
  const [unverifiedUsers, setUnverifiedUsers] = useState<UnverifiedUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [deletingUser, setDeletingUser] = useState<string | null>(null);

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
      loadUnverifiedUsers();
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

  // Unverified users functions
  const loadUnverifiedUsers = async () => {
    setLoadingUsers(true);
    try {
      const users = await getUnverifiedUsers();
      setUnverifiedUsers(users);
    } catch (error) {
      console.error('Error loading unverified users:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm(t('admin.unverifiedUsers.confirmDelete'))) return;

    setDeletingUser(userId);
    try {
      await deleteUnverifiedUser(userId);
      loadUnverifiedUsers();
      alert(t('admin.unverifiedUsers.deleteSuccess'));
    } catch (error) {
      console.error('Error deleting user:', error);
      alert(t('admin.unverifiedUsers.deleteError'));
    } finally {
      setDeletingUser(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedUsers.size === 0) return;
    
    if (!confirm(t('admin.unverifiedUsers.confirmBulkDelete', { count: selectedUsers.size }))) return;

    try {
      const count = await deleteMultipleUnverifiedUsers(Array.from(selectedUsers));
      setSelectedUsers(new Set());
      loadUnverifiedUsers();
      alert(t('admin.unverifiedUsers.bulkDeleteSuccess', { count }));
    } catch (error) {
      console.error('Error bulk deleting users:', error);
      alert(t('admin.unverifiedUsers.bulkDeleteError'));
    }
  };

  const toggleUserSelection = (userId: string) => {
    const newSelection = new Set(selectedUsers);
    if (newSelection.has(userId)) {
      newSelection.delete(userId);
    } else {
      newSelection.add(userId);
    }
    setSelectedUsers(newSelection);
  };

  const selectAllUsers = () => {
    if (selectedUsers.size === unverifiedUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(unverifiedUsers.map(u => u.id)));
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

        {/* Unverified Users Section */}
        <div className="bg-app-card shadow-card rounded-2xl border border-white/10 p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-xl font-semibold text-text-primary">
                {t('admin.unverifiedUsers.title')}
              </h2>
              <p className="text-sm text-text-secondary mt-1">
                {t('admin.unverifiedUsers.subtitle')}
              </p>
            </div>
            {selectedUsers.size > 0 && (
              <button
                onClick={handleBulkDelete}
                className="px-4 py-2 text-sm bg-chart-pink/20 text-chart-pink border border-chart-pink rounded-lg hover:bg-chart-pink/30 transition-colors whitespace-nowrap font-medium"
              >
                🗑️ {t('admin.unverifiedUsers.deleteSelected')} ({selectedUsers.size})
              </button>
            )}
          </div>

          {loadingUsers ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-app-cyan mx-auto mb-4"></div>
              <p className="text-text-secondary">{t('common.loading')}</p>
            </div>
          ) : unverifiedUsers.length === 0 ? (
            <div className="text-center py-8">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-chart-cyan/20 mb-4">
                <svg className="h-6 w-6 text-chart-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-text-secondary">{t('admin.unverifiedUsers.noUsers')}</p>
            </div>
          ) : (
            <>
              {/* Select All */}
              <div className="mb-4 pb-4 border-b border-white/10">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedUsers.size === unverifiedUsers.length}
                    onChange={selectAllUsers}
                    className="w-4 h-4 text-app-blue focus:ring-app-blue rounded"
                  />
                  <span className="text-sm text-text-secondary">
                    {t('admin.unverifiedUsers.selectAll')} ({unverifiedUsers.length})
                  </span>
                </label>
              </div>

              {/* Users List */}
              <div className="space-y-3">
                {unverifiedUsers.map((user) => (
                  <div
                    key={user.id}
                    className={`bg-app-secondary border rounded-xl p-4 transition-all ${
                      selectedUsers.has(user.id) 
                        ? 'border-app-blue bg-app-blue/5' 
                        : 'border-white/10'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={selectedUsers.has(user.id)}
                        onChange={() => toggleUserSelection(user.id)}
                        className="mt-1 w-4 h-4 text-app-blue focus:ring-app-blue rounded"
                      />

                      {/* User Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="font-semibold text-text-primary truncate">
                              {user.displayName || t('profile.noName')}
                            </p>
                            <p className="text-sm text-text-secondary truncate">{user.email}</p>
                            <div className="flex flex-wrap gap-2 mt-2 text-xs">
                              <span className={`px-2 py-1 rounded-full font-medium ${
                                user.accountAge >= 3 
                                  ? 'bg-chart-pink/20 text-chart-pink'
                                  : user.accountAge >= 1
                                  ? 'bg-yellow-500/20 text-yellow-500'
                                  : 'bg-chart-cyan/20 text-chart-cyan'
                              }`}>
                                {user.accountAge === 0 
                                  ? t('admin.unverifiedUsers.today')
                                  : t('admin.unverifiedUsers.daysOld', { days: user.accountAge })
                                }
                              </span>
                              <span className="px-2 py-1 bg-white/5 text-text-muted rounded-full">
                                {user.role}
                              </span>
                            </div>
                          </div>

                          {/* Delete Button */}
                          <button
                            onClick={() => handleDeleteUser(user.id)}
                            disabled={deletingUser === user.id}
                            className="px-3 py-2 text-xs bg-chart-pink/20 text-chart-pink rounded-lg hover:bg-chart-pink/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            {deletingUser === user.id ? (
                              <span className="flex items-center gap-1">
                                <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                ...
                              </span>
                            ) : (
                              t('common.delete')
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

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

