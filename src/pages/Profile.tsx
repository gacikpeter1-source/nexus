/**
 * User Profile Page
 * View and edit user profile information
 */

import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Container from '../components/layout/Container';
import RoleBadge from '../components/common/RoleBadge';
import NotificationSettings from '../components/notifications/NotificationSettings';
import { uploadFile } from '../services/firebase/storage';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { getParentChildren, generateParentInviteCode, redeemParentInviteCode } from '../services/firebase/parentChild';
import type { User } from '../types';

export default function Profile() {
  const { user, resendVerificationEmail } = useAuth();
  const { t } = useLanguage();
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');
  const [photoURL, setPhotoURL] = useState(user?.photoURL || '');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [children, setChildren] = useState<User[]>([]);
  const [inviteCode, setInviteCode] = useState('');
  const [inviteChildName, setInviteChildName] = useState('');
  const [inviteGenerating, setInviteGenerating] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (user?.role === 'parent' || (user?.childIds && user.childIds.length > 0)) {
      getParentChildren(user!.id).then(setChildren).catch(console.error);
    }
  }, [user?.id]);

  if (!user) return null;

  async function handleGenerateCode(childId: string, childName: string) {
    setInviteGenerating(true);
    try {
      const code = await generateParentInviteCode(user!.id, childId, childName);
      setInviteCode(code);
      setInviteChildName(childName);
    } catch (err) {
      console.error('Error generating invite code', err);
    } finally {
      setInviteGenerating(false);
    }
  }

  async function handleRedeemCode() {
    if (!redeemCode.trim()) return;
    setRedeemLoading(true);
    setRedeemMsg(null);
    try {
      const result = await redeemParentInviteCode(redeemCode.trim(), user!.id);
      setRedeemMsg({ type: 'success', text: `${t('parent.redeemCodeSuccess')}: ${result.childName}` });
      setRedeemCode('');
      // Refresh children list
      const updated = await getParentChildren(user!.id);
      setChildren(updated);
    } catch (err: any) {
      const key = err.message === 'code_already_used' ? 'parent.codeAlreadyUsed'
        : err.message === 'code_expired' ? 'parent.codeExpired'
        : err.message === 'own_code' ? 'parent.codeOwnCode'
        : 'parent.codeInvalid';
      setRedeemMsg({ type: 'error', text: t(key) });
    } finally {
      setRedeemLoading(false);
    }
  }

  function calcAge(dob?: string): number | null {
    if (!dob) return null;
    const today = new Date();
    const birth = new Date(dob);
    let age = today.getFullYear() - birth.getFullYear();
    if (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate())) age--;
    return age;
  }

  async function handlePhotoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert(t('profile.photo.invalidType'));
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert(t('profile.photo.tooLarge'));
      return;
    }

    try {
      setUploading(true);

      // TODO: Delete old photo if exists
      // Note: user.photoURL is a download URL, not a storage path
      // We would need to store the storage path separately to delete it
      // For now, old photos will remain in storage

      // Upload new photo
      const uploadResult = await uploadFile(file, {
        category: 'profile',
        userId: user.id,
        visibility: 'public',
      });

      // Update user profile in Firestore
      await updateDoc(doc(db, 'users', user.id), {
        photoURL: uploadResult.downloadUrl,
      });

      setPhotoURL(uploadResult.downloadUrl);
      alert(t('profile.photo.uploadSuccess'));
    } catch (error) {
      console.error('Error uploading photo:', error);
      alert(t('profile.photo.uploadError'));
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveProfile() {
    if (!user) return;

    try {
      await updateDoc(doc(db, 'users', user.id), {
        displayName,
        phoneNumber,
      });
      alert(t('profile.saveSuccess'));
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving profile:', error);
      alert(t('profile.saveError'));
    }
  }

  async function handleResendVerification() {
    setSendingVerification(true);
    setVerificationMessage('');

    try {
      await resendVerificationEmail();
      setVerificationMessage(t('profile.information.verificationSent'));
    } catch (error: any) {
      console.error('Error resending verification:', error);
      setVerificationMessage(t('profile.information.verificationError'));
    } finally {
      setSendingVerification(false);
    }
  }

  return (
    <Container className="max-w-4xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-app-card border border-white/10 rounded-2xl shadow-card p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              {/* Avatar / Photo */}
              <div className="relative group">
                {photoURL || user.photoURL ? (
                  <img
                    src={photoURL || user.photoURL}
                    alt={user.displayName || 'Profile'}
                    className="w-20 h-20 rounded-full object-cover border-2 border-app-blue"
                  />
                ) : (
                  <div className="w-20 h-20 bg-gradient-primary rounded-full flex items-center justify-center text-3xl font-bold text-white">
                    {user.displayName?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
                
                {/* Upload Photo Button (Overlay on hover) */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  {uploading ? (
                    <svg className="animate-spin h-6 w-6 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
                
                {/* Hidden File Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </div>
              
              {/* User Info */}
              <div>
                <h1 className="text-2xl font-bold text-text-primary">
                  {user.displayName || t('profile.noName')}
                </h1>
                <p className="text-text-secondary">{user.email}</p>
                <div className="mt-2">
                  <RoleBadge role={user.role} />
                </div>
              </div>
            </div>

            {/* Edit Button */}
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="bg-gradient-primary text-white font-semibold px-6 py-3 rounded-xl shadow-button hover:shadow-button-hover transition-all duration-300 hover:-translate-y-0.5"
            >
              {isEditing ? t('common.cancel') : t('common.edit')}
            </button>
          </div>
        </div>

        {/* Profile Information */}
        <div className="bg-app-card border border-white/10 rounded-2xl shadow-card p-6">
          <h2 className="text-xl font-bold text-text-primary mb-4">
            {t('profile.information.title')}
          </h2>

          <div className="space-y-4">
            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('profile.information.displayName')}
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:ring-2 focus:ring-app-blue"
                />
              ) : (
                <p className="text-text-primary">{user.displayName || '-'}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('profile.information.email')}
              </label>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-text-primary">{user.email}</p>
                  {!user.emailVerified && (
                    <p className="text-sm text-chart-pink mt-1">
                      {t('profile.information.emailNotVerified')}
                    </p>
                  )}
                  {user.emailVerified && (
                    <p className="text-sm text-chart-cyan mt-1 flex items-center">
                      <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      {t('profile.information.emailVerified')}
                    </p>
                  )}
                  {verificationMessage && (
                    <p className={`text-sm mt-1 ${verificationMessage.includes('!') ? 'text-chart-cyan' : 'text-chart-pink'}`}>
                      {verificationMessage}
                    </p>
                  )}
                </div>
                {!user.emailVerified && (
                  <button
                    onClick={handleResendVerification}
                    disabled={sendingVerification}
                    className="ml-4 px-4 py-2 text-sm font-medium text-app-blue border border-app-blue rounded-lg hover:bg-app-blue/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {sendingVerification ? (
                      <span className="flex items-center">
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        ...
                      </span>
                    ) : (
                      t('profile.information.resendVerification')
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('profile.information.phoneNumber')}
              </label>
              {isEditing ? (
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+421 900 123 456"
                  className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:ring-2 focus:ring-app-blue"
                />
              ) : (
                <p className="text-text-primary">{user.phoneNumber || '-'}</p>
              )}
            </div>

            {/* Role */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('profile.information.role')}
              </label>
              <RoleBadge role={user.role} />
            </div>

            {/* Clubs */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('profile.information.clubs')}
              </label>
              <p className="text-text-primary">
                {user.clubIds?.length || 0} {t('profile.information.clubsCount')}
              </p>
            </div>

            {/* Member Since */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('profile.information.memberSince')}
              </label>
              <p className="text-text-primary">
                {user.createdAt ? new Date(user.createdAt as string).toLocaleDateString() : '-'}
              </p>
            </div>
          </div>

          {/* Save Button */}
          {isEditing && (
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setIsEditing(false)}
                className="bg-white/10 border border-white/20 text-white font-semibold px-6 py-3 rounded-xl hover:bg-white/15 transition-all duration-300"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSaveProfile}
                className="bg-gradient-primary text-white font-semibold px-6 py-3 rounded-xl shadow-button hover:shadow-button-hover transition-all duration-300 hover:-translate-y-0.5"
              >
                {t('common.save')}
              </button>
            </div>
          )}
        </div>

        {/* Notification Settings */}
        <NotificationSettings />

        {/* Athletes — visible for users with parent role or existing children */}
        {(user.role === 'parent' || (user.childIds && user.childIds.length > 0)) && (
          <div className="bg-app-card border border-white/10 rounded-2xl shadow-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-text-primary">{t('parent.dashboard')}</h2>
                <p className="text-sm text-text-secondary mt-0.5">{t('parent.dashboardSubtitle')}</p>
              </div>
              <Link
                to="/parent/create-child"
                className="px-4 py-2 text-sm bg-gradient-primary text-white rounded-xl font-semibold shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300"
              >
                + {t('parent.addChild')}
              </Link>
            </div>

            {children.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-text-secondary mb-1">{t('parent.noChildren')}</p>
                <p className="text-xs text-text-muted">{t('parent.noChildrenDescription')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {children.map(child => {
                  const age = calcAge((child as any).dateOfBirth);
                  return (
                    <div
                      key={child.id}
                      className="flex items-center gap-3 p-3 bg-app-secondary rounded-xl border border-white/5"
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {child.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text-primary truncate">{child.displayName}</p>
                        {age !== null && (
                          <p className="text-xs text-text-muted">{age} {t('parent.yearsOld')}</p>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Link
                          to={`/parent/child/${child.id}`}
                          className="px-3 py-1.5 text-xs bg-app-blue/10 text-app-cyan border border-app-blue/20 rounded-lg hover:bg-app-blue/20 transition-colors"
                        >
                          {t('parent.viewSchedule')}
                        </Link>
                        <Link
                          to={`/parent/child/${child.id}/edit`}
                          className="px-3 py-1.5 text-xs bg-white/5 text-text-secondary border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
                        >
                          {t('common.edit')}
                        </Link>
                        <button
                          onClick={() => handleGenerateCode(child.id, child.displayName)}
                          disabled={inviteGenerating}
                          className="px-3 py-1.5 text-xs bg-chart-purple/10 text-chart-purple border border-chart-purple/20 rounded-lg hover:bg-chart-purple/20 transition-colors disabled:opacity-50"
                        >
                          {t('parent.shareCode')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Redeem an invite code from another parent */}
            <div className="mt-4 pt-4 border-t border-white/10">
              <p className="text-sm font-semibold text-text-primary mb-2">{t('parent.enterCode')}</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={redeemCode}
                  onChange={e => { setRedeemCode(e.target.value.toUpperCase()); setRedeemMsg(null); }}
                  placeholder={t('parent.enterCodePlaceholder')}
                  maxLength={6}
                  className="flex-1 px-3 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue font-mono tracking-widest uppercase"
                />
                <button
                  onClick={handleRedeemCode}
                  disabled={redeemLoading || redeemCode.length < 6}
                  className="px-4 py-2 text-sm bg-gradient-primary text-white rounded-lg font-semibold disabled:opacity-50 transition-all"
                >
                  {redeemLoading ? '…' : t('parent.redeemCode')}
                </button>
              </div>
              {redeemMsg && (
                <p className={`mt-2 text-xs ${redeemMsg.type === 'success' ? 'text-chart-cyan' : 'text-chart-pink'}`}>
                  {redeemMsg.text}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Danger Zone */}
        <div className="bg-app-card border border-chart-pink/30 rounded-2xl shadow-card p-6">
          <h2 className="text-xl font-bold text-chart-pink mb-4">
            {t('profile.dangerZone.title')}
          </h2>
          <p className="text-sm text-text-secondary mb-4">
            {t('profile.dangerZone.description')}
          </p>
          <button
            onClick={() => {
              if (confirm(t('profile.dangerZone.confirmDelete'))) {
                alert(t('profile.dangerZone.deleteInfo'));
              }
            }}
            className="bg-chart-pink/20 border border-chart-pink text-chart-pink font-semibold px-6 py-3 rounded-xl hover:bg-chart-pink/30 transition-all duration-300"
          >
            {t('profile.dangerZone.deleteAccount')}
          </button>
        </div>
      </div>
      {/* Invite code modal */}
      {inviteCode && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setInviteCode('')} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-app-card w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl p-6 text-center">
              <h2 className="text-lg font-bold text-text-primary mb-1">{t('parent.inviteCodeTitle')}</h2>
              <p className="text-sm text-text-secondary mb-1">{inviteChildName}</p>
              <p className="text-xs text-text-muted mb-6">{t('parent.inviteCodeDesc')}</p>

              <div className="bg-app-secondary rounded-xl px-6 py-4 mb-6">
                <p className="text-3xl font-bold tracking-[0.4em] text-app-cyan font-mono">{inviteCode}</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(inviteCode);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="flex-1 px-4 py-2.5 text-sm bg-app-blue/10 text-app-cyan border border-app-blue/20 rounded-xl hover:bg-app-blue/20 transition-colors font-semibold"
                >
                  {copied ? t('parent.inviteCodeCopied') : t('parent.inviteCodeCopy')}
                </button>
                <button
                  onClick={() => { setInviteCode(''); setCopied(false); }}
                  className="flex-1 px-4 py-2.5 text-sm bg-app-secondary border border-white/10 text-text-primary rounded-xl hover:bg-white/10 transition-colors font-semibold"
                >
                  {t('common.close')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </Container>
  );
}


