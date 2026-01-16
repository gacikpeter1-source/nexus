/**
 * Chat List Component
 * Shows list of user's chats with unread counts
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { subscribeToUserChats } from '../../services/firebase/chats';
import type { Chat } from '../../types';

interface ChatListProps {
  onSelectChat?: (chatId: string) => void;
  selectedChatId?: string;
}

export default function ChatList({ onSelectChat, selectedChatId }: ChatListProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    // Subscribe to real-time updates
    const unsubscribe = subscribeToUserChats(user.id, (updatedChats) => {
      setChats(updatedChats);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="text-6xl mb-4">💬</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {t('chat.noChats')}
        </h3>
        <p className="text-sm text-gray-600">
          {t('chat.noChatsDescription')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">{t('chat.chats')}</h2>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        {chats.map((chat) => {
          const unreadCount = user ? (chat.unreadCounts?.[user.id] || 0) : 0;
          const isSelected = chat.id === selectedChatId;

          return (
            <Link
              key={chat.id}
              to={`/chat/${chat.id}`}
              onClick={() => onSelectChat?.(chat.id!)}
              className={`flex items-start p-4 hover:bg-gray-50 transition-colors border-b border-gray-100 ${
                isSelected ? 'bg-primary bg-opacity-10' : ''
              }`}
            >
              {/* Avatar/Icon */}
              <div className="flex-shrink-0 w-12 h-12 bg-primary rounded-full flex items-center justify-center text-white text-xl mr-3">
                {getChatTypeIcon(chat.type)}
              </div>

              {/* Chat Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className={`font-semibold truncate ${
                    unreadCount > 0 ? 'text-gray-900' : 'text-gray-700'
                  }`}>
                    {chat.name}
                  </h3>
                  {chat.lastMessage && (
                    <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                      {formatTime(chat.lastMessage.timestamp)}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  {chat.lastMessage ? (
                    <p className={`text-sm truncate ${
                      unreadCount > 0 ? 'font-medium text-gray-900' : 'text-gray-600'
                    }`}>
                      {chat.lastMessage.text}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400 italic">
                      {t('chat.noMessages')}
                    </p>
                  )}

                  {/* Unread Badge */}
                  {unreadCount > 0 && (
                    <span className="flex-shrink-0 ml-2 px-2 py-0.5 bg-primary text-white text-xs font-semibold rounded-full min-w-[20px] text-center">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </div>

                {/* Pinned indicator */}
                {chat.isPinned && (
                  <div className="flex items-center mt-1">
                    <span className="text-xs text-primary">📌 {t('chat.pinned')}</span>
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

