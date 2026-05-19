/**
 * Message Item Component
 * Displays individual chat message with reactions, replies, and actions
 */

import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Message } from '../../types';
import { addReaction, removeReaction, pinMessage, unpinMessage, deleteMessage } from '../../services/firebase/messages';
import EmojiPicker from './EmojiPicker';

interface MessageItemProps {
  message: Message;
  clubId: string;
  teamId: string;
  userId: string;
  isTrainer: boolean;
  onReply: (message: Message) => void;
  onRefresh: () => void;
}

export default function MessageItem({
  message,
  clubId,
  teamId,
  userId,
  isTrainer,
  onReply,
  onRefresh,
}: MessageItemProps) {
  const { t } = useLanguage();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [processing, setProcessing] = useState(false);

  const isOwnMessage = message.senderId === userId;
  const reactions = message.reactions || {};

  const handleReaction = async (emoji: string) => {
    try {
      const hasReacted = reactions[emoji]?.includes(userId);
      if (hasReacted) {
        await removeReaction(clubId, teamId, message.id, userId, emoji);
      } else {
        await addReaction(clubId, teamId, message.id, userId, emoji);
      }
      onRefresh();
    } catch (error) {
      console.error('Error toggling reaction:', error);
    }
  };

  const handlePin = async () => {
    setProcessing(true);
    try {
      if (message.isPinned) {
        await unpinMessage(clubId, teamId, message.id);
      } else {
        await pinMessage(clubId, teamId, message.id, userId);
      }
      onRefresh();
      setShowActions(false);
    } catch (error) {
      console.error('Error toggling pin:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('chat.confirmDelete'))) return;
    
    setProcessing(true);
    try {
      await deleteMessage(clubId, teamId, message.id, false);
      onRefresh();
      setShowActions(false);
    } catch (error) {
      console.error('Error deleting message:', error);
    } finally {
      setProcessing(false);
    }
  };

  if (message.isDeleted) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 opacity-50">
        <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        <span className="text-sm text-text-muted italic">{t('chat.messageDeleted')}</span>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 px-4 py-2 hover:bg-white/5 transition-colors relative group ${message.isPinned ? 'bg-app-blue/10' : ''}`}>
      {/* Pin indicator */}
      {message.isPinned && (
        <div className="absolute top-2 left-1">
          <svg className="w-4 h-4 text-app-cyan" fill="currentColor" viewBox="0 0 24 24">
            <path d="M16 12V4h1a1 1 0 100-2H7a1 1 0 100 2h1v8l-2 2v2h5v5a1 1 0 102 0v-5h5v-2l-2-2z" />
          </svg>
        </div>
      )}

      {/* Avatar */}
      {message.senderPhotoURL ? (
        <img
          src={message.senderPhotoURL}
          alt={message.senderName}
          className="w-10 h-10 rounded-full flex-shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold flex-shrink-0">
          {message.senderName?.charAt(0).toUpperCase()}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-text-primary">{message.senderName}</span>
          <span className="text-xs text-text-muted">
            {new Date(message.timestamp?.toDate?.() || message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {message.isEdited && (
            <span className="text-xs text-text-muted italic">({t('chat.edited')})</span>
          )}
        </div>

        {/* Message text */}
        <p className="text-text-secondary text-sm mb-2 whitespace-pre-wrap break-words">{message.text}</p>

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="space-y-2 mb-2">
            {message.attachments.map((attachment, idx) => (
              <div key={idx}>
                {attachment.type === 'image' ? (
                  <img
                    src={attachment.url}
                    alt={attachment.name}
                    className="max-w-sm rounded-lg border border-white/10 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => window.open(attachment.url, '_blank')}
                  />
                ) : (
                  <a
                    href={attachment.url}
                    download={attachment.name}
                    className="flex items-center gap-2 p-2 bg-app-secondary border border-white/10 rounded-lg hover:bg-white/5 transition-colors max-w-sm"
                  >
                    <svg className="w-5 h-5 text-app-cyan flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary truncate">{attachment.name}</p>
                      {attachment.size && (
                        <p className="text-xs text-text-muted">{(attachment.size / 1024).toFixed(1)} KB</p>
                      )}
                    </div>
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Reactions */}
        {Object.keys(reactions).length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {Object.entries(reactions).map(([emoji, users]) => (
              <button
                key={emoji}
                onClick={() => handleReaction(emoji)}
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${
                  users.includes(userId)
                    ? 'bg-app-blue/30 border border-app-cyan/50'
                    : 'bg-app-secondary border border-white/10 hover:bg-white/10'
                }`}
              >
                <span>{emoji}</span>
                <span className="text-text-muted">{users.length}</span>
              </button>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* React button */}
          <div className="relative">
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-1 hover:bg-white/10 rounded transition-colors"
              title={t('chat.addReaction')}
            >
              <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            {showEmojiPicker && (
              <EmojiPicker
                onSelect={handleReaction}
                onClose={() => setShowEmojiPicker(false)}
              />
            )}
          </div>

          {/* Reply button */}
          <button
            onClick={() => onReply(message)}
            className="p-1 hover:bg-white/10 rounded transition-colors"
            title={t('chat.reply')}
          >
            <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>

          {/* Pin button (trainers only) */}
          {isTrainer && (
            <button
              onClick={handlePin}
              disabled={processing}
              className="p-1 hover:bg-white/10 rounded transition-colors disabled:opacity-50"
              title={message.isPinned ? t('chat.unpin') : t('chat.pin')}
            >
              <svg className={`w-4 h-4 ${message.isPinned ? 'text-app-cyan' : 'text-text-muted'}`} fill={message.isPinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
          )}

          {/* Delete button (own messages or trainers) */}
          {(isOwnMessage || isTrainer) && (
            <button
              onClick={handleDelete}
              disabled={processing}
              className="p-1 hover:bg-chart-pink/20 rounded transition-colors disabled:opacity-50"
              title={t('chat.delete')}
            >
              <svg className="w-4 h-4 text-chart-pink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
