/**
 * Chat Window Component
 * Displays messages in a chat with real-time updates
 */

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  subscribeToMessages,
  markChatAsRead,
  deleteMessage,
  addReaction,
  leaveChat,
  deleteChat,
} from '../../services/firebase/chats';
import type { Chat, Message } from '../../types';
import ChatMessageInput from './ChatMessageInput';

interface ChatWindowProps {
  chat: Chat;
  onLeftOrDeleted: () => void;
}

export default function ChatWindow({ chat, onLeftOrDeleted }: ChatWindowProps) {
  const chatId = chat.id;
  const { user } = useAuth();
  const { t } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Once I'm the only one left, there's no one to "leave" to — the action
  // becomes Delete instead (which permanently purges it after 60 days, see
  // cleanupDeletedChats). A fresh/corrupt doc with 0 participants is
  // treated the same as "last one left" rather than hiding both actions.
  const isLastParticipant = chat.participants.length <= 1;

  useEffect(() => {
    if (!chatId) return;

    // Subscribe to real-time messages
    const unsubscribe = subscribeToMessages(chatId, (updatedMessages) => {
      setMessages(updatedMessages);
      setLoading(false);
      scrollToBottom();
    });

    // Mark chat as read
    if (user) {
      markChatAsRead(chatId, user.id);
    }

    return () => unsubscribe();
  }, [chatId, user]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return t('chat.today');
    } else if (date.toDateString() === yesterday.toDateString()) {
      return t('chat.yesterday');
    } else {
      return date.toLocaleDateString();
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (confirm(t('chat.confirmDeleteMessage'))) {
      try {
        await deleteMessage(chatId, messageId);
      } catch (error) {
        console.error('Error deleting message:', error);
      }
    }
  };

  const handleLeave = async () => {
    if (!user) return;
    if (!confirm(t('chat.confirmLeaveConversation'))) return;
    setBusy(true);
    try {
      await leaveChat(chatId, user.id);
      onLeftOrDeleted();
    } catch (error) {
      console.error('Error leaving chat:', error);
      alert(t('chat.leaveConversationFailed'));
    } finally {
      setBusy(false);
      setShowMenu(false);
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    if (!confirm(t('chat.confirmDeleteConversation'))) return;
    setBusy(true);
    try {
      await deleteChat(chatId, user.id);
      onLeftOrDeleted();
    } catch (error) {
      console.error('Error deleting chat:', error);
      alert(t('chat.deleteConversationFailed'));
    } finally {
      setBusy(false);
      setShowMenu(false);
    }
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;

    try {
      await addReaction(chatId, messageId, emoji, user.id);
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  };

  // Group messages by date
  const groupMessagesByDate = () => {
    const groups: { [key: string]: Message[] } = {};

    messages.forEach(message => {
      const date = formatDate(message.timestamp);
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(message);
    });

    return groups;
  };

  const messageGroups = groupMessagesByDate();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="flex-shrink-0 border-b border-white/10 p-4 bg-app-card flex items-center justify-between gap-2 relative">
        <h2 className="text-lg font-semibold text-text-primary truncate">{chat.name}</h2>

        <button
          onClick={() => setShowMenu(v => !v)}
          disabled={busy}
          className="flex-shrink-0 p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/10 transition-colors disabled:opacity-50"
          aria-label={t('chat.chatOptions')}
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>

        {showMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
            <div className="absolute right-4 top-14 z-20 w-56 bg-app-card border border-white/10 rounded-xl shadow-card overflow-hidden">
              {!isLastParticipant && (
                <button
                  onClick={handleLeave}
                  disabled={busy}
                  className="w-full text-left px-4 py-2.5 text-sm text-text-primary hover:bg-white/5 transition-colors disabled:opacity-50"
                >
                  {t('chat.leaveConversation')}
                </button>
              )}
              <button
                onClick={handleDelete}
                disabled={busy || !isLastParticipant}
                title={!isLastParticipant ? t('chat.deleteRequiresLast') : undefined}
                className="w-full text-left px-4 py-2.5 text-sm text-chart-pink hover:bg-chart-pink/10 transition-colors disabled:opacity-40"
              >
                {t('chat.deleteConversation')}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-app-secondary">
        {Object.keys(messageGroups).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-6xl mb-4">💬</div>
            <p className="text-text-secondary">{t('chat.noMessages')}</p>
            <p className="text-sm text-text-muted mt-2">{t('chat.sendFirstMessage')}</p>
          </div>
        ) : (
          Object.entries(messageGroups).map(([date, msgs]) => (
            <div key={date}>
              {/* Date Separator */}
              <div className="flex items-center justify-center my-4">
                <div className="px-3 py-1 bg-white/10 rounded-full text-xs text-text-muted">
                  {date}
                </div>
              </div>

              {/* Messages for this date */}
              {msgs.map((message, index) => {
                const isOwnMessage = user && message.senderId === user.id;
                const showAvatar = !isOwnMessage && (
                  index === 0 || msgs[index - 1].senderId !== message.senderId
                );

                return (
                  <div
                    key={message.id}
                    className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-2`}
                  >
                    {/* Avatar (for other users) */}
                    {!isOwnMessage && (
                      <div className="flex-shrink-0 mr-2">
                        {showAvatar ? (
                          <div className="w-8 h-8 bg-gradient-primary rounded-full flex items-center justify-center text-white text-sm font-medium">
                            {message.senderName?.charAt(0).toUpperCase() || 'U'}
                          </div>
                        ) : (
                          <div className="w-8"></div>
                        )}
                      </div>
                    )}

                    {/* Message Bubble */}
                    <div className={`max-w-[70%] ${isOwnMessage ? 'items-end' : 'items-start'} flex flex-col`}>
                      {/* Sender Name (for other users) */}
                      {!isOwnMessage && showAvatar && (
                        <div className="text-xs text-text-muted mb-1 px-3">
                          {message.senderName || 'Unknown'}
                        </div>
                      )}

                      {/* Message Content */}
                      <div className="group relative">
                        <div
                          className={`px-4 py-2 rounded-2xl ${
                            isOwnMessage
                              ? 'bg-gradient-primary text-white'
                              : 'bg-app-card text-text-primary border border-white/10'
                          } ${message.isDeleted ? 'italic opacity-60' : ''}`}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {message.text}
                          </p>

                          {/* Edited indicator */}
                          {message.isEdited && !message.isDeleted && (
                            <span className="text-xs opacity-70 ml-2">
                              ({t('chat.edited')})
                            </span>
                          )}
                        </div>

                        {/* Message Actions (on hover) */}
                        {!message.isDeleted && (
                          <div className="absolute top-0 right-0 hidden group-hover:flex items-center space-x-1 bg-app-card border border-white/10 rounded-lg shadow-lg -mt-8 px-2 py-1">
                            <button
                              onClick={() => handleReaction(message.id!, '👍')}
                              className="text-sm hover:scale-110 transition-transform"
                            >
                              👍
                            </button>
                            <button
                              onClick={() => handleReaction(message.id!, '❤️')}
                              className="text-sm hover:scale-110 transition-transform"
                            >
                              ❤️
                            </button>
                            <button
                              onClick={() => handleReaction(message.id!, '😂')}
                              className="text-sm hover:scale-110 transition-transform"
                            >
                              😂
                            </button>
                            {isOwnMessage && (
                              <button
                                onClick={() => handleDeleteMessage(message.id!)}
                                className="text-red-500 text-xs px-2 hover:bg-red-50 rounded"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        )}

                        {/* Reactions */}
                        {message.reactions && Object.keys(message.reactions).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {Object.entries(message.reactions).map(([emoji, users]) => (
                              <button
                                key={emoji}
                                onClick={() => handleReaction(message.id!, emoji)}
                                className="px-2 py-0.5 bg-white/10 rounded-full text-xs flex items-center space-x-1 hover:bg-white/20"
                              >
                                <span>{emoji}</span>
                                <span className="text-text-muted">{users.length}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Timestamp */}
                      <div className="text-xs text-text-muted mt-1 px-3">
                        {formatTime(message.timestamp)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="flex-shrink-0 border-t border-white/10 bg-app-card">
        <ChatMessageInput chatId={chatId} />
      </div>
    </div>
  );
}


