/**
 * Chat List Component
 * Shows list of user's chats with unread counts
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { subscribeToUserChats } from '../../services/firebase/chats';
import type { Chat } from '../../types';
import NewChatModal from './NewChatModal';

interface TeamChatEntry {
  clubId: string;
  clubName: string;
  teamId: string;
  teamName: string;
}

interface ChatListProps {
  onSelectChat?: (chatId: string) => void;
  onSelectTeamChat?: (clubId: string, teamId: string) => void;
  selectedChatId?: string;
  selectedTeamId?: string;
}

export default function ChatList({ onSelectChat, onSelectTeamChat, selectedChatId, selectedTeamId }: ChatListProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [chats, setChats] = useState<Chat[]>([]);
  const [teamChats, setTeamChats] = useState<TeamChatEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewChatModal, setShowNewChatModal] = useState(false);

  // Subscribe to direct/group chats
  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToUserChats(user.id, (updatedChats) => {
      setChats(updatedChats);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user?.id]);

  // Load teams the user belongs to (one-time, on mount)
  useEffect(() => {
    if (!user?.clubIds?.length) return;

    const loadTeams = async () => {
      try {
        const clubs = await getDocs(
          query(collection(db, 'clubs'), where('__name__', 'in', user.clubIds.slice(0, 10)))
        );
        const entries: TeamChatEntry[] = [];
        clubs.forEach(snap => {
          const data = snap.data();
          for (const team of (data.teams || [])) {
            const memberIds: string[] = team.membersData
              ? Object.keys(team.membersData)
              : (team.members || []);
            const belongs = memberIds.includes(user.id)
              || team.trainers?.includes(user.id)
              || data.ownerId === user.id
              || data.trainers?.includes(user.id);
            if (belongs) {
              entries.push({ clubId: snap.id, clubName: data.name, teamId: team.id, teamName: team.name });
            }
          }
        });
        setTeamChats(entries);
      } catch (err) {
        console.error('Error loading team chats:', err);
      }
    };

    loadTeams();
  }, [user?.id]);

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('chat.justNow');
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  };

  const getChatTypeIcon = (type: string) => {
    switch (type) {
      case 'team':
        return '👥';
      case 'club':
        return '🏢';
      case 'group':
        return '👫';
      default:
        return '💬';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-cyan"></div>
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between bg-app-secondary">
            <h2 className="text-lg font-bold text-text-primary">{t('chat.chats')}</h2>
            <button 
              onClick={() => setShowNewChatModal(true)}
              className="p-2 bg-gradient-primary rounded-lg hover:shadow-button-hover transition-all"
              title={t('chat.newChat')}
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          {/* Empty State */}
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="text-6xl mb-4">💬</div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              {t('chat.noChats')}
            </h3>
            <p className="text-sm text-text-muted mb-4">
              {t('chat.noChatsDescription')}
            </p>
            <button
              onClick={() => setShowNewChatModal(true)}
              className="px-4 py-2 bg-gradient-primary text-white rounded-lg hover:shadow-button-hover transition-all"
            >
              {t('chat.startNewChat')}
            </button>
          </div>
        </div>

        {/* New Chat Modal */}
        {showNewChatModal && (
          <NewChatModal onClose={() => setShowNewChatModal(false)} />
        )}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-app-secondary">
          <h2 className="text-lg font-bold text-text-primary">{t('chat.chats')}</h2>
          <button 
            onClick={() => setShowNewChatModal(true)}
            className="p-2 bg-gradient-primary rounded-lg hover:shadow-button-hover transition-all"
            title={t('chat.newChat')}
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        {/* Team chats section */}
        {teamChats.length > 0 && (
          <>
            <div className="px-4 py-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider bg-app-card/50">
              {t('chat.teamChats')}
            </div>
            {teamChats.map((tc) => {
              const isSelected = tc.teamId === selectedTeamId;
              return (
                <button
                  key={`${tc.clubId}-${tc.teamId}`}
                  onClick={() => onSelectTeamChat?.(tc.clubId, tc.teamId)}
                  className={`w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors border-b border-white/10 text-left ${isSelected ? 'bg-app-blue/20' : ''}`}
                >
                  <div className="flex-shrink-0 w-12 h-12 bg-app-secondary rounded-full flex items-center justify-center text-white text-xl border border-white/10">
                    👥
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-text-primary truncate">{tc.teamName}</p>
                    <p className="text-xs text-text-muted truncate">{tc.clubName}</p>
                  </div>
                </button>
              );
            })}
            {chats.length > 0 && (
              <div className="px-4 py-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider bg-app-card/50">
                {t('chat.directChats')}
              </div>
            )}
          </>
        )}

        {chats.map((chat) => {
          const unreadCount = user ? (chat.unreadCounts?.[user.id] || 0) : 0;
          const isSelected = chat.id === selectedChatId;

          return (
            <Link
              key={chat.id}
              to={`/chat/${chat.id}`}
              onClick={() => onSelectChat?.(chat.id!)}
              className={`flex items-start p-4 hover:bg-white/5 transition-colors border-b border-white/10 ${
                isSelected ? 'bg-app-blue/20' : ''
              }`}
            >
              {/* Avatar/Icon */}
              <div className="flex-shrink-0 w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center text-white text-xl mr-3">
                {getChatTypeIcon(chat.type)}
              </div>

              {/* Chat Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className={`font-semibold truncate ${
                    unreadCount > 0 ? 'text-text-primary' : 'text-text-secondary'
                  }`}>
                    {chat.name}
                  </h3>
                  {chat.lastMessage && (
                    <span className="text-xs text-text-muted flex-shrink-0 ml-2">
                      {formatTime(chat.lastMessage.timestamp)}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  {chat.lastMessage ? (
                    <p className={`text-sm truncate ${
                      unreadCount > 0 ? 'font-medium text-text-primary' : 'text-text-muted'
                    }`}>
                      {chat.lastMessage.text}
                    </p>
                  ) : (
                    <p className="text-sm text-text-muted italic">
                      {t('chat.noMessages')}
                    </p>
                  )}

                  {/* Unread Badge */}
                  {unreadCount > 0 && (
                    <span className="flex-shrink-0 ml-2 px-2 py-0.5 bg-gradient-primary text-white text-xs font-semibold rounded-full min-w-[20px] text-center">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </div>

                {/* Pinned indicator */}
                {chat.isPinned && (
                  <div className="flex items-center mt-1">
                    <span className="text-xs text-app-cyan">📌 {t('chat.pinned')}</span>
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
      </div>

      {/* New Chat Modal */}
      {showNewChatModal && (
        <NewChatModal onClose={() => setShowNewChatModal(false)} />
      )}
    </>
  );
}


