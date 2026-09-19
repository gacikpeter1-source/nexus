/**
 * Create Inventory — name it, pick club-wide or one team, then a starting
 * set of columns (see buildDefaultInventoryFields) the trainer can rename,
 * remove, or extend with their own before saving.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { getUserClubs } from '../../services/firebase/clubs';
import { createInventory, buildDefaultInventoryFields } from '../../services/firebase/inventory';
import type { Club, InventoryField, InventoryFieldType } from '../../types';

const FIELD_TYPES: InventoryFieldType[] = ['text', 'number', 'date', 'checkbox'];

export default function CreateInventory() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubId, setClubId] = useState(searchParams.get('clubId') || '');
  const [teamId, setTeamId] = useState(searchParams.get('teamId') || '');
  const [name, setName] = useState('');
  const [fields, setFields] = useState<InventoryField[]>(buildDefaultInventoryFields());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    getUserClubs(user.id)
      .then(list => {
        setClubs(list);
        if (!clubId && list.length === 1) setClubId(list[0].id!);
      })
      .catch(err => console.error('CreateInventory: load clubs failed', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const selectedClub = clubs.find(c => c.id === clubId);

  const updateField = (id: string, patch: Partial<InventoryField>) => {
    setFields(prev => prev.map(f => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeField = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
  };

  const addField = () => {
    setFields(prev => [...prev, { id: crypto.randomUUID(), label: '', type: 'text' }]);
  };

  const canSave = !!user && !!clubId && name.trim().length > 0 && fields.every(f => f.label.trim().length > 0);

  const handleSave = async () => {
    if (!user || !canSave) return;
    setSaving(true);
    setError('');
    try {
      const id = await createInventory({
        clubId,
        teamId: teamId || undefined,
        name: name.trim(),
        fields,
        createdBy: user.id,
      });
      navigate(`/tools/inventory/${id}`);
    } catch (err) {
      console.error('CreateInventory: create failed', err);
      setError(t('inventory.errors.createFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container className="max-w-2xl">
      <div className="py-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-text-primary">{t('inventory.createTitle')}</h1>
          <Link to="/tools/inventory" className="text-xs text-app-cyan hover:text-app-cyan/80">
            ← {t('inventory.title')}
          </Link>
        </div>

        <div className="bg-app-card shadow-card rounded-2xl border border-white/10 p-4 sm:p-5 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">{t('inventory.name')}</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('inventory.namePlaceholder')}
              className="w-full px-3 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">{t('inventory.club')}</label>
              <select
                value={clubId}
                onChange={e => { setClubId(e.target.value); setTeamId(''); }}
                className="w-full px-3 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
              >
                <option value="">{t('inventory.selectClub')}</option>
                {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">{t('inventory.scope')}</label>
              <select
                value={teamId}
                onChange={e => setTeamId(e.target.value)}
                disabled={!selectedClub}
                className="w-full px-3 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue disabled:opacity-50"
              >
                <option value="">{t('inventory.clubWide')}</option>
                {selectedClub?.teams?.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-app-card shadow-card rounded-2xl border border-white/10 p-4 sm:p-5 space-y-2">
          <h2 className="text-sm font-bold text-text-primary">{t('inventory.columns')}</h2>
          <p className="text-xs text-text-secondary">{t('inventory.columnsDesc')}</p>

          <div className="space-y-1.5 pt-1">
            {fields.map(field => (
              <div key={field.id} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={field.label}
                  onChange={e => updateField(field.id, { label: e.target.value })}
                  placeholder={t('inventory.columnNamePlaceholder')}
                  className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
                />
                <select
                  value={field.type}
                  onChange={e => updateField(field.id, { type: e.target.value as InventoryFieldType })}
                  className="px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue flex-shrink-0"
                >
                  {FIELD_TYPES.map(ft => <option key={ft} value={ft}>{t(`inventory.fieldTypes.${ft}`)}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => removeField(field.id)}
                  className="text-text-muted hover:text-chart-pink text-sm px-1.5 flex-shrink-0"
                  aria-label={t('common.remove')}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addField}
            className="px-2.5 py-1.5 text-[10px] font-semibold bg-app-secondary border border-white/10 text-app-cyan rounded-lg hover:border-app-cyan transition-colors"
          >
            + {t('inventory.addColumn')}
          </button>
        </div>

        {error && <p className="text-xs text-chart-pink">{error}</p>}

        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full px-4 py-3 text-sm font-semibold bg-gradient-primary text-white rounded-xl shadow-button disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? t('common.saving') : t('inventory.createButton')}
        </button>
      </div>
    </Container>
  );
}
