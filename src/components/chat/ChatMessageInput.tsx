/**
 * Chat Message Input Component
 * Input field for sending messages in general chat
 */

import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { sendMessage } from '../../services/firebase/chats';

interface ChatMessageInputProps {
  chatId: string;
}

export default function ChatMessageInput({ chatId }: ChatMessageInputProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!text.trim() || !user || sending) return;

    setSending(true);
    try {
      await sendMessage(
        chatId,
        user.id,
        text.trim(),
        user.displayName,
        user.photoURL || undefined
      );
      setText('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 flex items-end gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
        placeholder={t('chat.typeMessage')}
        rows={1}
        className="flex-1 bg-app-secondary border border-white/10 rounded-lg px-4 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-cyan/50 resize-none max-h-32"
        style={{
          minHeight: '40px',
          height: 'auto',
        }}
        disabled={sending}
      />

      <button
        type="submit"
        disabled={!text.trim() || sending}
        className="p-2 bg-gradient-primary text-white rounded-lg hover:shadow-button-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        title={t('chat.send')}
      >
        {sending ? (
          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        )}
      </button>
    </form>
  );
}
