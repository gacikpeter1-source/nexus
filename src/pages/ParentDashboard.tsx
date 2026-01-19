/**
 * Parent Dashboard Page
 * Manage children, view their schedules, RSVP on their behalf
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Container from '../components/layout/Container';
import { getParentChildren, deleteChildAccount } from '../services/firebase/parentChild';
import type { User } from '../types';

export default function ParentDashboard() {
  const { user } = useAuth();
  const { t } = useLanguage();
  
  const [children, setChildren] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingChildId, setDeletingChildId] = useState<string | null>(null);

  // Load children
  useEffect(() => {
    if (user) {
      loadChildren();
    }
  }, [user]);

  async function loadChildren() {
    try {
      setLoading(true);
      const childrenData = await getParentChildren(user!.id);
      setChildren(childrenData);
    } catch (error) {
      console.error('Error loading children:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteChild(childId: string) {
    if (!confirm(t('parent.confirmDeleteChild'))) return;
    
    try {
      setDeletingChildId(childId);
      await deleteChildAccount(user!.id, childId);
      await loadChildren();
    } catch (error) {
      console.error('Error deleting child:', error);
      alert(t('parent.deleteChildError'));
    } finally {
      setDeletingChildId(null);
    }
  }

  function calculateAge(dateOfBirth?: string): number | null {
    if (!dateOfBirth) return null;
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  if (loading) {
    return (
      <Container>
        <div className="py-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-app-cyan mx-auto mb-4"></div>
          <p className="text-text-secondary">{t('common.loading')}</p>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div className="py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">
              {t('parent.dashboard')}
            </h1>
          </div>
          
          <Link
            to="/parent/create-child"
            className="px-8 py-4 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold"
          >
            + {t('parent.addChild')}
          </Link>
        </div>

        {/* Children List */}
        {children.length === 0 ? (
          <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-12 text-center">
            <h3 className="text-xl font-semibold text-text-primary mb-2">
              {t('parent.noChildren')}
            </h3>
            <p className="text-text-secondary mb-6">
              {t('parent.noChildrenDescription')}
            </p>
            <Link
              to="/parent/create-child"
              className="inline-block px-8 py-4 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold"
            >
              {t('parent.addFirstChild')}
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {children.map(child => (
              <div
                key={child.id}
                className="bg-app-card rounded-2xl shadow-card border border-white/10 p-6 hover:-translate-y-1 transition-all duration-300"
              >
                {/* Child Avatar */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center">
                    <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-button">
                      {child.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-semibold text-text-primary">
                        {child.displayName}
                      </h3>
                      {child.dateOfBirth && (
                        <p className="text-sm text-text-secondary">
                          {calculateAge(child.dateOfBirth)} {t('parent.yearsOld')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Child Info */}
                <div className="space-y-2 mb-4">
                  {child.clubIds && child.clubIds.length > 0 && (
                    <div className="flex items-center text-sm text-text-secondary">
                      <span className="w-2 h-2 rounded-full bg-chart-blue mr-3"></span>
                      <span>{child.clubIds.length} {t('parent.clubs')}</span>
                    </div>
                  )}
                  
                  {child.teamIds && child.teamIds.length > 0 && (
                    <div className="flex items-center text-sm text-text-secondary">
                      <span className="w-2 h-2 rounded-full bg-chart-purple mr-3"></span>
                      <span>{child.teamIds.length} {t('parent.teams')}</span>
                    </div>
                  )}
                  
                  {child.dateOfBirth && (
                    <div className="flex items-center text-sm text-text-secondary">
                      <span className="w-2 h-2 rounded-full bg-chart-cyan mr-3"></span>
                      <span>{new Date(child.dateOfBirth).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex space-x-2 pt-4 border-t border-white/10">
                  <Link
                    to={`/parent/child/${child.id}`}
                    className="flex-1 px-4 py-2 bg-gradient-primary text-white rounded-xl hover:shadow-button transition-all duration-300 text-center text-sm font-semibold"
                  >
                    {t('parent.viewSchedule')}
                  </Link>
                  
                  <Link
                    to={`/parent/child/${child.id}/edit`}
                    className="px-4 py-2 bg-app-secondary text-text-primary border border-white/10 rounded-xl hover:bg-white/10 transition-all duration-300 text-sm font-semibold"
                  >
                    {t('common.edit')}
                  </Link>
                  
                  <button
                    onClick={() => handleDeleteChild(child.id)}
                    disabled={deletingChildId === child.id}
                    className="px-4 py-2 bg-chart-pink/20 text-chart-pink rounded-xl hover:bg-chart-pink/30 transition-all duration-300 text-sm font-semibold disabled:opacity-50"
                  >
                    {deletingChildId === child.id ? '...' : t('common.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Info Box */}
        <div className="mt-8 bg-app-card border border-app-cyan/30 rounded-2xl p-6 shadow-card">
          <h3 className="text-lg font-semibold text-app-cyan mb-4">
            {t('parent.infoTitle')}
          </h3>
          <ul className="space-y-3 text-sm text-text-secondary">
            <li className="flex items-start">
              <span className="mr-3 text-app-cyan">•</span>
              <span>{t('parent.infoDesc1')}</span>
            </li>
            <li className="flex items-start">
              <span className="mr-3 text-app-cyan">•</span>
              <span>{t('parent.infoDesc2')}</span>
            </li>
            <li className="flex items-start">
              <span className="mr-3 text-app-cyan">•</span>
              <span>{t('parent.infoDesc3')}</span>
            </li>
            <li className="flex items-start">
              <span className="mr-3 text-app-cyan">•</span>
              <span>{t('parent.infoDesc4')}</span>
            </li>
          </ul>
        </div>
      </div>
    </Container>
  );
}

