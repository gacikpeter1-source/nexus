/**
 * Pinned Messages Header Component
 * Shows unread pinned messages at the top of chat
 */

import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Message } from '../../types';
import { markPinnedAsRead } from '../../services/firebase/messages';

interface PinnedMessagesHeaderProps {
  clubId: string;
  teamId: string;
  userId: string;
  pinnedMessages: Message[];
  onRefresh: () => void;
}

export default function PinnedMessagesHeader({
  clubId,
  teamId,
  userId,
  pinnedMessages,
  onRefresh,
}: PinnedMessagesHeaderProps) {
  const { t } = useLanguage();
  const [showList, setShowList] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [marking, setMarking] = useState<string | null>(null);

  // Filter unread pinned messages
  const unreadPinned = pinnedMessages.filter(msg => !msg.readBy?.includes(userId));

  if (unreadPinned.length === 0) {
    return null;
  }

  const handleMarkAsRead = async (messageId: string) => {
    setMarking(messageId);
    try {
      await markPinnedAsRead(clubId, teamId, messageId, userId);
      onRefresh();
      if (selectedMessage?.id === messageId) {
        setSelectedMessage(null);
      }
    } catch (error) {
      console.error('Error marking as read:', error);
    } finally {
      setMarking(null);
    }
  };

  return (
    <>
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-app-blue/20 to-app-cyan/20 border-b border-app-blue/30 p-3">
        <button
          onClick={() => setShowList(true)}
          className="w-full flex items-center justify-between hover:bg-white/5 rounded-lg p-2 transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-app-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <div className="text-left">
              <p className="text-sm font-semibold text-text-primary">
                {t('chat.importantMessages')}
              </p>
              <p className="text-xs text-text-muted">
                {unreadPinned.length} {t('chat.unreadPinned')}
              </p>
            </div>
          </div>
          <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Unread Pinned Messages List Modal */}
      {showList && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
            onClick={() => {
              setShowList(false);
              setSelectedMessage(null);
            }}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-app-card w-full max-w-2xl rounded-2xl border border-white/10 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <svg className="w-6 h-6 text-app-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  <h2 className="text-lg font-bold text-text-primary">{t('chat.pinnedMessages')}</h2>
                  <span className="text-sm text-text-muted">({unreadPinned.length})</span>
                </div>
                <button
                  onClick={() => {
                    setShowList(false);
                    setSelectedMessage(null);
                  }}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {unreadPinned.map((message) => (
                  <div
                    key={message.id}
                    className="bg-app-secondary border border-white/10 rounded-lg p-4"
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      {message.senderPhotoURL ? (
                        <img
                          src={message.senderPhotoURL}
                          alt={message.senderName}
                          className="w-10 h-10 rounded-full"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold">
                          {message.senderName?.charAt(0).toUpperCase()}
                        </div>
                      )}

                      {/* Content */}
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-text-primary">{message.senderName}</span>
                          <span className="text-xs text-text-muted">
                            {new Date(typeof message.pinnedAt === 'string' ? message.pinnedAt : message.pinnedAt?.toDate?.() || new Date()).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm text-text-secondary mb-3 line-clamp-3">{message.text}</p>

                        {/* Actions */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSelectedMessage(message)}
                            className="px-3 py-1.5 text-xs bg-app-blue/20 text-app-cyan border border-app-blue/30 rounded-lg hover:bg-app-blue/30 transition-colors"
                          >
                            {t('chat.viewFull')}
                          </button>
                          <button
                            onClick={() => handleMarkAsRead(message.id)}
                            disabled={marking === message.id}
                            className="px-3 py-1.5 text-xs bg-gradient-primary text-white rounded-lg hover:shadow-button-hover transition-all disabled:opacity-50"
                          >
                            {marking === message.id ? t('common.loading') : t('chat.markAsRead')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Full Message View Modal */}
      {selectedMessage && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 z-[60] backdrop-blur-sm"
            onClick={() => setSelectedMessage(null)}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="bg-app-card w-full max-w-xl rounded-2xl border border-white/10 shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <h3 className="text-lg font-bold text-text-primary">{t('chat.pinnedMessage')}</h3>
                <button
                  onClick={() => setSelectedMessage(null)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="p-4">
                <div className="flex items-start gap-3 mb-4">
                  {selectedMessage.senderPhotoURL ? (
                    <img
                      src={selectedMessage.senderPhotoURL}
                      alt={selectedMessage.senderName}
                      className="w-12 h-12 rounded-full"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold text-lg">
                      {selectedMessage.senderName?.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div>
                    <p className="font-semibold text-text-primary">{selectedMessage.senderName}</p>
                    <p className="text-xs text-text-muted">
                      {new Date(typeof selectedMessage.pinnedAt === 'string' ? selectedMessage.pinnedAt : selectedMessage.pinnedAt?.toDate?.() || new Date()).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="bg-app-secondary border border-white/10 rounded-lg p-4 mb-4">
                  <p className="text-text-secondary whitespace-pre-wrap">{selectedMessage.text}</p>

                  {/* Attachments */}
                  {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {selectedMessage.attachments.map((attachment, idx) => (
                        <div key={idx}>
                          {attachment.type === 'image' ? (
                            <img
                              src={attachment.url}
                              alt={attachment.name}
                              className="max-w-full rounded-lg border border-white/10"
                            />
                          ) : (
                            <a
                              href={attachment.url}
                              download={attachment.name}
                              className="flex items-center gap-2 p-2 bg-app-card border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
                            >
                              <svg className="w-5 h-5 text-app-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span className="text-sm text-text-primary">{attachment.name}</span>
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedMessage(null)}
                    className="flex-1 px-4 py-2 bg-app-secondary border border-white/10 text-white rounded-lg hover:bg-white/10 transition-all"
                  >
                    {t('chat.saveLater')}
                  </button>
                  <button
                    onClick={() => handleMarkAsRead(selectedMessage.id)}
                    disabled={marking === selectedMessage.id}
                    className="flex-1 px-4 py-2 bg-gradient-primary text-white rounded-lg hover:shadow-button-hover transition-all disabled:opacity-50"
                  >
                    {marking === selectedMessage.id ? t('common.loading') : t('chat.markAsRead')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
