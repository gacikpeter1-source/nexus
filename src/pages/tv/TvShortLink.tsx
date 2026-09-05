/**
 * Resolves a short TV code (e.g. /t/482913) to the real /tv/{tournamentId}
 * board and redirects there — see services/firebase/tvShortCodes.ts for why
 * this exists (a short code is much easier to type by hand into a smart
 * TV's on-screen keyboard than the full board URL).
 */

import { useState, useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { resolveTvShortCode } from '../../services/firebase/tvShortCodes';

export default function TvShortLink() {
  const { code } = useParams<{ code: string }>();
  const { t } = useLanguage();

  const [tournamentId, setTournamentId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!code) return;
    resolveTvShortCode(code)
      .then(setTournamentId)
      .catch(() => setTournamentId(null));
  }, [code]);

  if (tournamentId === undefined) {
    return (
      <Container>
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-cyan" />
        </div>
      </Container>
    );
  }

  if (tournamentId === null) {
    return (
      <Container>
        <div className="py-16 text-center">
          <p className="text-sm text-text-secondary">{t('tv.notFound')}</p>
        </div>
      </Container>
    );
  }

  return <Navigate to={`/tv/${tournamentId}`} replace />;
}
