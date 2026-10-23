/**
 * Public, no-login landing page for the app owner's contact QR shown on
 * tournament TV boards (see TournamentTV.tsx + Admin Panel's "Kontaktné
 * QR" section). A QR code can only encode one URL, not a choice between
 * WhatsApp and SMS — this page is that choice, read live from
 * config/commercialQr so changing the phone number never needs a
 * redeploy or a new QR code.
 */

import { useEffect, useState } from 'react';
import { getCommercialQrConfig } from '../services/firebase/commercialQr';
import { useLanguage } from '../contexts/LanguageContext';
import type { CommercialQrConfig } from '../types';

export default function ContactChoice() {
  const { t } = useLanguage();
  const [config, setConfig] = useState<CommercialQrConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCommercialQrConfig()
      .then(setConfig)
      .catch(err => console.error('ContactChoice: load config failed', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-app-primary flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-cyan" />
      </div>
    );
  }

  if (!config || !config.phone) {
    return (
      <div className="min-h-screen bg-app-primary flex items-center justify-center p-6">
        <p className="text-sm text-text-muted text-center">{t('contact.unavailable')}</p>
      </div>
    );
  }

  const digitsOnly = config.phone.replace(/[^\d]/g, '');
  const whatsappUrl = `https://wa.me/${digitsOnly}`;
  const smsUrl = `sms:${config.phone}`;

  return (
    <div className="min-h-screen bg-app-primary flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-app-card rounded-2xl shadow-card border border-white/10 p-6 text-center space-y-5">
        <h1 className="text-lg font-bold text-text-primary">{config.label || t('contact.defaultLabel')}</h1>
        <p className="text-sm text-text-muted">{config.phone}</p>
        <div className="space-y-3">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-3.5 bg-[#25D366] text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            💬 WhatsApp
          </a>
          <a
            href={smsUrl}
            className="flex items-center justify-center gap-2 w-full px-4 py-3.5 bg-gradient-primary text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            ✉️ {t('contact.sms')}
          </a>
        </div>
      </div>
    </div>
  );
}
