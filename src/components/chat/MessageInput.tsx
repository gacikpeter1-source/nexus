/**
 * Message Input Component
 * Input field for sending messages and files
 */

import { useState, useRef } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Message } from '../../types';

interface MessageInputProps {
  onSend: (text: string, file?: File) => Promise<void>;
  replyingTo: Message | null;
  onCancelReply: () => void;
}

export default function MessageInput({ onSend, replyingTo, onCancelReply }: MessageInputProps) {
  const { t } = useLanguage();
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if ((!text.trim() && !file) || sending) return;

    setSending(true);
    try {
      await onSend(text, file || undefined);
      setText('');
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Check file size (max 10MB)
      if (selectedFile.size > 10 * 1024 * 1024) {
        alert(t('chat.fileTooLarge'));
        return;
      }
      setFile(selectedFile);
    }
  };

  return (
    <div className="border-t border-white/10 bg-app-card">
      {/* Reply preview */}
      {replyingTo && (
        <div className="flex items-center justify-between p-3 border-b border-white/10 bg-app-secondary">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-app-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            <div>
              <p className="text-xs text-text-muted">{t('chat.replyingTo')} {replyingTo.senderName}</p>
              <p className="text-sm text-text-secondary line-clamp-1">{replyingTo.text}</p>
            </div>
          </div>
          <button
            onClick={onCancelReply}
            className="p-1 hover:bg-white/10 rounded transition-colors"
          >
            <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* File preview */}
      {file && (
        <div className="flex items-center justify-between p-3 border-b border-white/10 bg-app-secondary">
          <div className="flex items-center gap-2">
            {file.type.startsWith('image/') ? (
              <svg className="w-5 h-5 text-app-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-app-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            )}
            <div>
              <p className="text-sm text-text-primary">{file.name}</p>
              <p className="text-xs text-text-muted">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
          <button
            onClick={() => {
              setFile(null);
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
            }}
            className="p-1 hover:bg-white/10 rounded transition-colors"
          >
            <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Input form */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2 p-3">
        {/* File upload button */}
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          accept="image/*,.pdf,.doc,.docx,.txt"
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
          title={t('chat.attachFile')}
        >
          <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>

        {/* Text input */}
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

        {/* Send button */}
        <button
          type="submit"
          disabled={(!text.trim() && !file) || sending}
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
    </div>
  );
}
