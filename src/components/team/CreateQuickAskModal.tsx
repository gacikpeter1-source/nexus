/**
 * Trainer/assistant/club-owner quick-ask launcher — one question, sent to
 * the whole team as a push notification. See QuickAsk in types/index.ts.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { createQuickAsk } from '../../services/firebase/quickAsks';

interface Props {
  clubId: string;
  teamId: string;
  createdBy: string;
  creatorName: string;
  onClose: () => void;
}

export default function CreateQuickAskModal({ clubId, teamId, createdBy, creatorName, onClose }: Props) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const trimmed = question.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const quickAskId = await createQuickAsk({ clubId, teamId, createdBy, creatorName, question: trimmed });
      onClose();
      navigate(`/clubs/${clubId}/teams/${teamId}/quick-ask/${quickAskId}`);
    } catch (err) {
      console.error('Failed to create quick ask:', err);
      setSending(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-app-card w-full max-w-md rounded-2xl border border-white/10 shadow-2xl">
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <h2 className="text-lg font-bold text-text-primary">⚡ {t('quickAsk.createTitle')}</h2>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
              <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-4 space-y-3">
            <p className="text-xs text-text-secondary">{t('quickAsk.createSubtitle')}</p>
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder={t('quickAsk.questionPlaceholder')}
              rows={3}
              autoFocus
              className="w-full px-3 py-2.5 bg-app-secondary border border-white/10 rounded-lg text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-app-cyan resize-none"
            />
            <button
              onClick={handleSend}
              disabled={!question.trim() || sending}
              className="w-full py-2.5 bg-gradient-primary text-white font-semibold rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {sending ? t('quickAsk.sending') : t('quickAsk.send')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
