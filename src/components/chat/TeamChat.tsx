/**
 * Team Chat Component
 * Main chat interface for team communication
 */

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Message, Team } from '../../types';
import {
  subscribeToMessages,
  getPinnedMessages,
  sendMessage,
  sendMessageWithFile,
} from '../../services/firebase/messages';
import PinnedMessagesHeader from './PinnedMessagesHeader';
import MessageItem from './MessageItem';
import MessageInput from './MessageInput';

interface TeamChatProps {
  clubId: string;
  teamId: string;
  team: Team;
  isTrainer: boolean;
}

export default function TeamChat({ clubId, teamId, team: _team, isTrainer }: TeamChatProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Load messages
  useEffect(() => {
    if (!clubId || !teamId) return;

    setLoading(true);

    // Subscribe to messages
    const unsubscribe = subscribeToMessages(clubId, teamId, (newMessages) => {
      setMessages(newMessages);
      setLoading(false);
      
      // Scroll to bottom on new messages
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });

    // Load pinned messages
    loadPinnedMessages();

    return () => unsubscribe();
  }, [clubId, teamId]);

  const loadPinnedMessages = async () => {
    try {
      const pinned = await getPinnedMessages(clubId, teamId);
      setPinnedMessages(pinned);
    } catch (error) {
      console.error('Error loading pinned messages:', error);
    }
  };

  const handleSendMessage = async (text: string, file?: File) => {
    if (!user) return;

    try {
      if (file) {
        await sendMessageWithFile(
          clubId,
          teamId,
          user.id,
          text,
          user.displayName,
          file,
          user.photoURL,
          replyingTo?.id
        );
      } else {
        await sendMessage(
          clubId,
          teamId,
          user.id,
          text,
          user.displayName,
          user.photoURL,
          replyingTo?.id
        );
      }
      
      setReplyingTo(null);
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  };

  const handleRefresh = () => {
    loadPinnedMessages();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 mx-auto mb-2 text-app-cyan" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-sm text-text-muted">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-text-muted">{t('chat.loginRequired')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-app-secondary">
      {/* Pinned Messages Header */}
      {pinnedMessages.length > 0 && (
        <PinnedMessagesHeader
          clubId={clubId}
          teamId={teamId}
          userId={user.id}
          pinnedMessages={pinnedMessages}
          onRefresh={handleRefresh}
        />
      )}

      {/* Messages List */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto"
        style={{ minHeight: 0 }}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <svg className="w-16 h-16 mb-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <h3 className="text-lg font-semibold text-text-primary mb-2">{t('chat.noMessages')}</h3>
            <p className="text-sm text-text-muted">{t('chat.startConversation')}</p>
          </div>
        ) : (
          <div className="py-4">
            {messages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                clubId={clubId}
                teamId={teamId}
                userId={user.id}
                isTrainer={isTrainer}
                onReply={setReplyingTo}
                onRefresh={handleRefresh}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Message Input */}
      <MessageInput
        onSend={handleSendMessage}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
      />
    </div>
  );
}
