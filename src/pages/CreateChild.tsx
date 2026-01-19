/**
 * Create Child Account Page
 * Form for parents to create child subaccounts
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Container from '../components/layout/Container';
import { createChildAccount } from '../services/firebase/parentChild';

export default function CreateChild() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({
    displayName: '',
    dateOfBirth: '',
    customFields: {} as Record<string, any>
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!formData.displayName.trim()) {
      setError(t('parent.nameRequired'));
      return;
    }
    
    try {
      setLoading(true);
      setError('');
      
      await createChildAccount(user!.id, {
        displayName: formData.displayName.trim(),
        dateOfBirth: formData.dateOfBirth,
        customFields: formData.customFields
      });
      
      // Success! Redirect to parent dashboard
      navigate('/parent/dashboard');
      
    } catch (error) {
      console.error('Error creating child:', error);
      setError(t('parent.createChildError'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container>
      <div className="py-8 max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-primary">
            {t('parent.addChild')}
          </h1>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-app-card rounded-2xl shadow-card border border-white/10 p-6 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="bg-chart-pink/10 border border-chart-pink/30 rounded-xl p-4 text-chart-pink">
              {error}
            </div>
          )}

          {/* Display Name */}
          <div>
            <label htmlFor="displayName" className="block text-sm font-semibold text-text-primary mb-2">
              {t('parent.childName')} <span className="text-chart-pink">*</span>
            </label>
            <input
              type="text"
              id="displayName"
              value={formData.displayName}
              onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
              className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue focus:border-transparent transition-all"
              placeholder={t('parent.childNamePlaceholder')}
              required
            />
            <p className="mt-1 text-sm text-text-muted">
              {t('parent.childNameHint')}
            </p>
          </div>

          {/* Date of Birth */}
          <div>
            <label htmlFor="dateOfBirth" className="block text-sm font-semibold text-text-primary mb-2">
              {t('parent.dateOfBirth')}
            </label>
            <input
              type="date"
              id="dateOfBirth"
              value={formData.dateOfBirth}
              onChange={(e) => setFormData(prev => ({ ...prev, dateOfBirth: e.target.value }))}
              className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue focus:border-transparent transition-all"
              max={new Date().toISOString().split('T')[0]}
            />
            <p className="mt-1 text-sm text-text-muted">
              {t('parent.dateOfBirthHint')}
            </p>
          </div>

          {/* Info Box */}
          <div className="bg-app-cyan/10 border border-app-cyan/30 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-app-cyan mb-3">
              {t('parent.importantNote')}
            </h3>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li className="flex items-start">
                <span className="mr-3 text-app-cyan">•</span>
                <span>{t('parent.childCannotLogin')}</span>
              </li>
              <li className="flex items-start">
                <span className="mr-3 text-app-cyan">•</span>
                <span>{t('parent.childManagedByParent')}</span>
              </li>
              <li className="flex items-start">
                <span className="mr-3 text-app-cyan">•</span>
                <span>{t('parent.childRsvpByParent')}</span>
              </li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex space-x-4 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={() => navigate('/parent/dashboard')}
              className="flex-1 px-6 py-3 bg-app-secondary text-text-primary border border-white/10 rounded-xl hover:bg-white/10 transition-all duration-300 font-semibold"
            >
              {t('common.cancel')}
            </button>
            
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all duration-300 font-semibold"
            >
              {loading ? t('common.creating') : t('parent.createChild')}
            </button>
          </div>
        </form>
      </div>
    </Container>
  );
}

