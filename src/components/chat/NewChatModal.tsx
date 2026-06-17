/**
 * New Chat Modal Component
 * Search users and create new conversations
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { createChat, getOrCreateOneToOneChat } from '../../services/firebase/chats';
import type { User } from '../../types';

interface NewChatModalProps {
  onClose: () => void;
}

export default function NewChatModal({ onClose }: NewChatModalProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const isGroup = selectedUsers.length > 1;

  // Search users
  useEffect(() => {
    if (!searchTerm.trim() || searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }

    const searchUsers = async () => {
      setLoading(true);
      try {
        const usersRef = collection(db, 'users');
        
        // Search by display name (case-insensitive search would require additional setup)
        const q = query(
          usersRef,
          where('displayName', '>=', searchTerm),
          where('displayName', '<=', searchTerm + '\uf8ff'),
          limit(10)
        );
        
        const snapshot = await getDocs(q);
        const users = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as User))
          .filter(u => u.id !== user?.id)              // Exclude current user
          .filter(u => !u.managedByParentId);           // Exclude virtual athlete accounts
        
        setSearchResults(users);
      } catch (error) {
        console.error('Error searching users:', error);
      } finally {
        setLoading(false);
      }
    };

    const debounceTimer = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm, user?.id]);

  const handleToggleUser = (selectedUser: User) => {
    if (selectedUsers.find(u => u.id === selectedUser.id)) {
      setSelectedUsers(selectedUsers.filter(u => u.id !== selectedUser.id));
    } else {
      setSelectedUsers([...selectedUsers, selectedUser]);
    }
  };

  const handleCreateChat = async () => {
    if (!user || selectedUsers.length === 0) return;

    setCreating(true);
    try {
      let chatId: string;

      if (selectedUsers.length === 1) {
        // One-on-one chat
        chatId = await getOrCreateOneToOneChat(
          user.id,
          selectedUsers[0].id,
          user.displayName,
          selectedUsers[0].displayName
        );
      } else {
        // Group chat — use custom name or fall back to participant list
        const chatName = groupName.trim() || selectedUsers.map(u => u.displayName).join(', ');
        const participants = [user.id, ...selectedUsers.map(u => u.id)];

        chatId = await createChat({
          name: chatName,
          type: 'group',
          participants,
          createdBy: user.id,
        });
      }

      // Navigate to the new chat
      navigate(`/chat/${chatId}`);
      onClose();
    } catch (error) {
      console.error('Error creating chat:', error);
      alert('Failed to create chat. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-app-card w-full max-w-2xl rounded-2xl border border-white/10 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <h2 className="text-lg font-bold text-text-primary">
              {isGroup ? t('chat.newGroupChat') : t('chat.newChat')}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search Input */}
          <div className="p-4 border-b border-white/10">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('chat.searchUsers')}
                className="w-full pl-10 pr-4 py-2 bg-app-secondary border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
                autoFocus
              />
            </div>
          </div>

          {/* Selected Users */}
          {selectedUsers.length > 0 && (
            <div className="p-4 border-b border-white/10 bg-app-secondary space-y-3">
              <div>
                <p className="text-sm text-text-muted mb-2">
                  {isGroup ? t('chat.groupParticipants') : t('chat.selected')}: {selectedUsers.length}
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedUsers.map((selectedUser) => (
                    <div
                      key={selectedUser.id}
                      className="flex items-center gap-2 px-3 py-1.5 bg-app-blue/20 border border-app-cyan/30 rounded-full"
                    >
                      <span className="text-sm text-text-primary">{selectedUser.displayName}</span>
                      <button
                        onClick={() => handleToggleUser(selectedUser)}
                        className="hover:bg-white/10 rounded-full p-0.5"
                      >
                        <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Group name input — only shown when 2+ participants */}
              {isGroup && (
                <input
                  type="text"
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  placeholder={t('chat.groupNamePlaceholder')}
                  maxLength={50}
                  className="w-full px-3 py-2 text-sm bg-app-card border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
                />
              )}
            </div>
          )}

          {/* Search Results */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-cyan"></div>
              </div>
            ) : searchTerm.trim() && searchResults.length === 0 ? (
              <div className="text-center py-8">
                <svg className="w-12 h-12 mx-auto mb-2 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <p className="text-text-muted">{t('chat.noUsersFound')}</p>
              </div>
            ) : !searchTerm.trim() ? (
              <div className="text-center py-8">
                <svg className="w-12 h-12 mx-auto mb-2 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-text-muted">{t('chat.searchUsersHint')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {searchResults.map((searchUser) => {
                  const isSelected = selectedUsers.find(u => u.id === searchUser.id);
                  
                  return (
                    <button
                      key={searchUser.id}
                      onClick={() => handleToggleUser(searchUser)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                        isSelected
                          ? 'bg-app-blue/20 border border-app-cyan/30'
                          : 'hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      {/* Avatar */}
                      {searchUser.photoURL ? (
                        <img
                          src={searchUser.photoURL}
                          alt={searchUser.displayName}
                          className="w-10 h-10 rounded-full"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold">
                          {searchUser.displayName?.charAt(0).toUpperCase()}
                        </div>
                      )}

                      {/* User Info */}
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium text-text-primary">{searchUser.displayName}</p>
                        <p className="text-xs text-text-muted">{searchUser.email}</p>
                      </div>

                      {/* Checkbox */}
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        isSelected
                          ? 'bg-app-cyan border-app-cyan'
                          : 'border-white/30'
                      }`}>
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-white/10 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-app-secondary border border-white/10 text-white rounded-lg hover:bg-white/10 transition-all"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleCreateChat}
              disabled={selectedUsers.length === 0 || creating}
              className="flex-1 px-4 py-2 bg-gradient-primary text-white rounded-lg hover:shadow-button-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? t('common.loading') : t('chat.startChat')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
