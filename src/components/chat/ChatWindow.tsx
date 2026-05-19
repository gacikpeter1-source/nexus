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
} from '../../services/firebase/chats';
import type { Message } from '../../types';
import ChatMessageInput from './ChatMessageInput';

interface ChatWindowProps {
  chatId: string;
  chatName: string;
}

export default function ChatWindow({ chatId, chatName }: ChatWindowProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      <div className="flex-shrink-0 border-b border-white/10 p-4 bg-app-card">
        <h2 className="text-lg font-semibold text-text-primary">{chatName}</h2>
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


