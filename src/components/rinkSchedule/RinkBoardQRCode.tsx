/**
 * Modal shown to staff from RinkScheduleHub: the public TV board link + a
 * scannable QR code, mirroring TeamQRCode.tsx's copy/download pattern.
 */

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { getShareableOrigin } from '../../config/siteOrigin';
import { useLanguage } from '../../contexts/LanguageContext';

export default function RinkBoardQRCode({ clubId, onClose }: { clubId: string; onClose: () => void }) {
  const { t } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  const boardUrl = `${getShareableOrigin()}/rink-board/${clubId}`;

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, boardUrl, {
        width: 260,
        margin: 2,
        color: { dark: '#FFFFFF', light: '#1A1F2E' },
      }, () => {});
    }
  }, [boardUrl]);

  const copyLink = () => {
    navigator.clipboard.writeText(boardUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-app-card w-full max-w-sm rounded-2xl border border-white/10 p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-text-primary">{t('rinkSchedule.tvBoard')}</h3>
        <div className="bg-app-primary rounded-xl p-4 flex justify-center">
          <canvas ref={canvasRef} />
        </div>
        <p className="text-xs text-text-secondary text-center">{t('rinkSchedule.tvBoardHint')}</p>
        <div className="bg-app-secondary border border-white/10 rounded-lg p-3">
          <p className="text-sm text-text-primary break-all font-mono">{boardUrl}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={copyLink} className="flex-1 px-3 py-2 text-sm font-semibold bg-white/5 border border-white/10 rounded-lg text-text-secondary">
            {copied ? t('common.copied') : t('common.copyLink')}
          </button>
          <button onClick={onClose} className="flex-1 px-3 py-2 text-sm font-semibold bg-gradient-primary text-white rounded-lg shadow-button">
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
