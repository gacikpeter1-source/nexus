/**
 * Manages the physical surfaces (rinks/pitches/courts/pools/mats/rings/
 * cages — see getVenueLabels) a tournament plays on. Shared by
 * TournamentBracketSection (team-score) and CombatBracketSection
 * (individual-elimination) — persistence is left to the caller since each
 * stores rinks on a differently-shaped bracket object.
 */

import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { getVenueLabels } from '../../constants/sportVenue';
import type { TournamentRink, RinkLayout } from '../../types';

interface Props {
  rinks: TournamentRink[];
  sport?: string;
  onAdd: (rink: TournamentRink) => Promise<void>;
  onRemove: (rinkId: string) => Promise<void>;
}

export default function RinkManager({ rinks, sport, onAdd, onRemove }: Props) {
  const { t, currentLanguage } = useLanguage();
  const venue = getVenueLabels(sport, currentLanguage);

  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [layout, setLayout] = useState<RinkLayout>('full');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onAdd({ id: crypto.randomUUID(), name: trimmed, layout });
      setName('');
      setLayout('full');
      setShowAdd(false);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (rinkId: string) => {
    if (!confirm(venue.removeConfirm)) return;
    await onRemove(rinkId);
  };

  return (
    <div className="pt-1 border-t border-white/5">
      <div className="flex items-center justify-between pt-1.5">
        <h3 className="text-[10px] font-semibold text-text-secondary uppercase">{venue.plural}</h3>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="px-2 py-1 text-[10px] font-semibold bg-app-secondary border border-white/10 text-app-cyan rounded-lg hover:border-app-cyan transition-colors"
        >
          + {venue.addLabel}
        </button>
      </div>

      {showAdd && (
        <div className="flex items-center gap-1.5 pt-1.5">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={venue.namePlaceholder}
            className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary"
          />
          <select
            value={layout}
            onChange={e => setLayout(e.target.value as RinkLayout)}
            className="px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary flex-shrink-0"
          >
            <option value="full">{venue.fullLabel}</option>
            <option value="halfCrossIce">{t('nominations.bracket.layouts.halfCrossIce')}</option>
            <option value="thirdsCrossIce">{t('nominations.bracket.layouts.thirdsCrossIce')}</option>
            <option value="halfLengthwise">{t('nominations.bracket.layouts.halfLengthwise')}</option>
          </select>
          <button
            onClick={handleAdd}
            disabled={saving || !name.trim()}
            className="px-2.5 py-1.5 text-[10px] font-semibold bg-gradient-primary text-white rounded-lg disabled:opacity-50 flex-shrink-0"
          >
            {t('common.save')}
          </button>
        </div>
      )}

      {rinks.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1.5">
          {rinks.map(r => (
            <span key={r.id} className="flex items-center gap-1 px-2 py-1 text-[10px] bg-app-secondary border border-white/10 rounded-lg text-text-primary">
              {r.name} · {r.layout === 'full' ? venue.fullLabel : t(`nominations.bracket.layouts.${r.layout}`)}
              <button onClick={() => handleRemove(r.id)} className="text-text-muted hover:text-chart-pink">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
