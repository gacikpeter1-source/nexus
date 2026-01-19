/**
 * Create Team Modal
 * Modal for creating a new team within a club
 * Mobile-first design
 */

import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { createTeam } from '../../services/firebase/clubs';

interface CreateTeamModalProps {
  clubId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateTeamModal({
  clubId,
  isOpen,
  onClose,
  onSuccess,
}: CreateTeamModalProps) {
  const { t: _t } = useLanguage();
  const { user } = useAuth();
  
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    description: '',
    logoURL: '',
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) return;
    
    if (!formData.name.trim()) {
      setError('Team name is required');
      return;
    }

    setCreating(true);
    setError('');

    try {
      await createTeam(clubId, {
        name: formData.name.trim(),
        category: formData.category.trim() || undefined,
        description: formData.description.trim() || undefined,
        trainers: [user.id], // Creator becomes trainer
        members: [user.id], // Creator becomes member
      });

      // Reset form
      setFormData({
        name: '',
        category: '',
        description: '',
        logoURL: '',
      });

      onSuccess();
      onClose();
      alert('Team created successfully!');
    } catch (error: any) {
      console.error('Error creating team:', error);
      setError(error.message || 'Failed to create team. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      name: '',
      category: '',
      description: '',
      logoURL: '',
    });
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
        onClick={handleCancel}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-x-hidden">
        <div className="bg-app-card w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl border border-white/10 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-6 border-b border-white/10">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-text-primary">
              Create New Team
            </h2>
            <button
              onClick={handleCancel}
              disabled={creating}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="space-y-4">
              {/* Team Name */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-text-secondary mb-2">
                  Team Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
                  placeholder="Enter team name..."
                  required
                  disabled={creating}
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-text-secondary mb-2">
                  Category (optional)
                </label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
                  placeholder="e.g., U12, U14, Senior..."
                  disabled={creating}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-text-secondary mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue resize-none"
                  placeholder="Brief description of the team..."
                  disabled={creating}
                />
              </div>

              {/* Logo URL */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-text-secondary mb-2">
                  Logo URL (optional)
                </label>
                <input
                  type="url"
                  value={formData.logoURL}
                  onChange={(e) => setFormData({ ...formData, logoURL: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
                  placeholder="https://example.com/logo.png"
                  disabled={creating}
                />
                {formData.logoURL && (
                  <div className="mt-2">
                    <img 
                      src={formData.logoURL} 
                      alt="Team logo preview" 
                      className="w-16 h-16 rounded-lg object-cover border border-white/10"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-chart-pink/20 border border-chart-pink/30 rounded-xl p-3">
                  <p className="text-xs sm:text-sm text-chart-pink font-medium">{error}</p>
                </div>
              )}

              {/* Info Box */}
              <div className="bg-app-blue/10 border border-app-blue/20 rounded-xl p-3">
                <p className="text-xs sm:text-sm text-text-secondary">
                  <strong className="text-app-cyan">Note:</strong> You will be automatically assigned as the trainer of this team.
                </p>
              </div>
            </div>
          </form>

          {/* Footer */}
          <div className="p-4 sm:p-6 border-t border-white/10 flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
            <button
              type="button"
              onClick={handleCancel}
              disabled={creating}
              className="flex-1 px-4 sm:px-6 py-2 sm:py-3 bg-app-secondary border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all duration-300 font-semibold text-sm sm:text-base disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={creating || !formData.name.trim()}
              className="flex-1 px-4 sm:px-6 py-2 sm:py-3 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {creating ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Creating...
                </span>
              ) : (
                'Create Team'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}


