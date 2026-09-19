/**
 * Inventory Detail — the item list for one inventory (add/edit/delete rows),
 * plus a "Manage columns" panel to rename/remove/add fields after creation.
 * Item add/edit is a single form generated from the inventory's own field
 * list, since fields are fully customizable.
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import {
  getInventory,
  getInventoryItems,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  updateInventory,
  deleteInventory,
} from '../../services/firebase/inventory';
import type { Inventory, InventoryItem, InventoryField, InventoryFieldType } from '../../types';

const FIELD_TYPES: InventoryFieldType[] = ['text', 'number', 'date', 'checkbox'];

function emptyValues(fields: InventoryField[]): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {};
  for (const f of fields) values[f.id] = f.type === 'checkbox' ? false : '';
  return values;
}

function formatValue(field: InventoryField, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (field.type === 'checkbox') return value ? '✓' : '—';
  if (field.type === 'date' && typeof value === 'string') {
    return new Date(value + 'T00:00:00').toLocaleDateString();
  }
  return String(value);
}

export default function InventoryDetail() {
  const { inventoryId } = useParams<{ inventoryId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();

  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemDraft, setItemDraft] = useState<Record<string, string | number | boolean>>({});
  const [saving, setSaving] = useState(false);

  const [showColumns, setShowColumns] = useState(false);
  const [fieldDrafts, setFieldDrafts] = useState<InventoryField[]>([]);
  const [savingColumns, setSavingColumns] = useState(false);

  useEffect(() => {
    if (inventoryId) load(inventoryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryId]);

  const load = async (id: string) => {
    setLoading(true);
    try {
      const [inv, itemList] = await Promise.all([getInventory(id), getInventoryItems(id)]);
      setInventory(inv);
      setItems(itemList.sort((a, b) => (b.createdAt as any)?.toMillis?.() - (a.createdAt as any)?.toMillis?.() || 0));
      if (inv) setFieldDrafts(inv.fields);
    } catch (err) {
      console.error('InventoryDetail: load failed', err);
    } finally {
      setLoading(false);
    }
  };

  const openAddItem = () => {
    if (!inventory) return;
    setItemDraft(emptyValues(inventory.fields));
    setEditingItemId(null);
    setShowItemForm(true);
  };

  const openEditItem = (item: InventoryItem) => {
    setItemDraft({ ...item.values });
    setEditingItemId(item.id);
    setShowItemForm(true);
  };

  const handleSaveItem = async () => {
    if (!user || !inventory || !inventoryId) return;
    setSaving(true);
    try {
      if (editingItemId) {
        await updateInventoryItem(editingItemId, inventory, itemDraft);
      } else {
        await addInventoryItem({ inventory, values: itemDraft, createdBy: user.id });
      }
      setShowItemForm(false);
      await load(inventoryId);
    } catch (err) {
      console.error('InventoryDetail: save item failed', err);
      alert(t('inventory.errors.saveItemFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!inventoryId || !confirm(t('inventory.confirmDeleteItem'))) return;
    try {
      await deleteInventoryItem(itemId);
      await load(inventoryId);
    } catch (err) {
      console.error('InventoryDetail: delete item failed', err);
    }
  };

  const updateFieldDraft = (id: string, patch: Partial<InventoryField>) => {
    setFieldDrafts(prev => prev.map(f => (f.id === id ? { ...f, ...patch } : f)));
  };
  const removeFieldDraft = (id: string) => {
    setFieldDrafts(prev => prev.filter(f => f.id !== id));
  };
  const addFieldDraft = () => {
    setFieldDrafts(prev => [...prev, { id: crypto.randomUUID(), label: '', type: 'text' }]);
  };

  const handleSaveColumns = async () => {
    if (!inventoryId || fieldDrafts.some(f => !f.label.trim())) return;
    setSavingColumns(true);
    try {
      await updateInventory(inventoryId, { fields: fieldDrafts });
      setShowColumns(false);
      await load(inventoryId);
    } catch (err) {
      console.error('InventoryDetail: save columns failed', err);
    } finally {
      setSavingColumns(false);
    }
  };

  const handleDeleteInventory = async () => {
    if (!inventoryId || !confirm(t('inventory.confirmDeleteInventory'))) return;
    try {
      await deleteInventory(inventoryId);
      window.location.href = '/tools/inventory';
    } catch (err) {
      console.error('InventoryDetail: delete inventory failed', err);
    }
  };

  if (loading) {
    return (
      <Container>
        <div className="text-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-cyan mx-auto" />
        </div>
      </Container>
    );
  }

  if (!inventory) {
    return (
      <Container>
        <div className="py-16 text-center">
          <h1 className="text-lg font-bold text-text-primary mb-2">{t('inventory.notFound')}</h1>
          <Link to="/tools/inventory" className="text-app-cyan hover:text-app-cyan/80">{t('inventory.title')}</Link>
        </div>
      </Container>
    );
  }

  const returnedField = inventory.fields.find(f => f.role === 'returned');

  return (
    <Container className="max-w-2xl">
      <div className="py-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-text-primary">{inventory.name}</h1>
            <p className="text-xs text-text-muted mt-0.5">{items.length} {t('inventory.itemsLabel')}</p>
          </div>
          <Link to="/tools/inventory" className="text-xs text-app-cyan hover:text-app-cyan/80 flex-shrink-0">
            ← {t('inventory.title')}
          </Link>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={openAddItem}
            className="px-3 py-1.5 text-xs font-semibold bg-gradient-primary text-white rounded-lg shadow-button"
          >
            + {t('inventory.addItem')}
          </button>
          <button
            onClick={() => setShowColumns(v => !v)}
            className="px-3 py-1.5 text-xs font-semibold bg-app-secondary border border-white/10 text-text-secondary rounded-lg hover:border-app-cyan hover:text-app-cyan transition-colors"
          >
            {t('inventory.manageColumns')}
          </button>
          <button
            onClick={handleDeleteInventory}
            className="px-3 py-1.5 text-xs font-semibold text-text-muted hover:text-chart-pink transition-colors ml-auto"
          >
            {t('common.delete')}
          </button>
        </div>

        {showColumns && (
          <div className="bg-app-card shadow-card rounded-2xl border border-white/10 p-4 sm:p-5 space-y-2">
            <h2 className="text-sm font-bold text-text-primary">{t('inventory.columns')}</h2>
            <div className="space-y-1.5">
              {fieldDrafts.map(field => (
                <div key={field.id} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={field.label}
                    onChange={e => updateFieldDraft(field.id, { label: e.target.value })}
                    className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
                  />
                  <select
                    value={field.type}
                    onChange={e => updateFieldDraft(field.id, { type: e.target.value as InventoryFieldType })}
                    className="px-2 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue flex-shrink-0"
                  >
                    {FIELD_TYPES.map(ft => <option key={ft} value={ft}>{t(`inventory.fieldTypes.${ft}`)}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeFieldDraft(field.id)}
                    className="text-text-muted hover:text-chart-pink text-sm px-1.5 flex-shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={addFieldDraft}
                className="px-2.5 py-1.5 text-[10px] font-semibold bg-app-secondary border border-white/10 text-app-cyan rounded-lg hover:border-app-cyan transition-colors"
              >
                + {t('inventory.addColumn')}
              </button>
              <button
                type="button"
                onClick={handleSaveColumns}
                disabled={savingColumns || fieldDrafts.some(f => !f.label.trim())}
                className="px-3 py-1.5 text-xs font-semibold bg-gradient-primary text-white rounded-lg disabled:opacity-40 ml-auto"
              >
                {savingColumns ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        )}

        {showItemForm && (
          <div className="bg-app-card shadow-card rounded-2xl border border-app-cyan/30 p-4 sm:p-5 space-y-3">
            <h2 className="text-sm font-bold text-text-primary">
              {editingItemId ? t('inventory.editItem') : t('inventory.addItem')}
            </h2>
            <div className="space-y-2">
              {inventory.fields.map(field => (
                <div key={field.id}>
                  <label className="block text-[10px] text-text-muted mb-1">{field.label}</label>
                  {field.type === 'checkbox' ? (
                    <input
                      type="checkbox"
                      checked={!!itemDraft[field.id]}
                      onChange={e => setItemDraft(prev => ({ ...prev, [field.id]: e.target.checked }))}
                      className="w-4 h-4"
                    />
                  ) : (
                    <input
                      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                      value={(itemDraft[field.id] as string | number) ?? ''}
                      onChange={e => setItemDraft(prev => ({
                        ...prev,
                        [field.id]: field.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value,
                      }))}
                      className="w-full px-2.5 py-1.5 text-xs bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveItem}
                disabled={saving}
                className="px-3 py-1.5 text-xs font-semibold bg-gradient-primary text-white rounded-lg disabled:opacity-40"
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
              <button
                type="button"
                onClick={() => setShowItemForm(false)}
                className="px-3 py-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {items.length === 0 ? (
            <p className="text-center py-10 text-xs text-text-secondary">{t('inventory.noItems')}</p>
          ) : items.map(item => (
            <div key={item.id} className="bg-app-secondary border border-white/10 rounded-lg p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 flex-1 min-w-0">
                  {inventory.fields.map(field => (
                    <div key={field.id} className="min-w-0">
                      <span className="text-[9px] text-text-muted uppercase font-semibold block">{field.label}</span>
                      <span className="text-xs text-text-primary truncate block">{formatValue(field, item.values[field.id])}</span>
                    </div>
                  ))}
                </div>
                {returnedField && (
                  <span className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    item.values[returnedField.id] ? 'bg-chart-cyan/20 text-chart-cyan' : 'bg-yellow-400/20 text-yellow-400'
                  }`}>
                    {item.values[returnedField.id] ? t('inventory.returned') : t('inventory.notReturned')}
                  </span>
                )}
              </div>
              <div className="flex gap-3 pt-1 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => openEditItem(item)}
                  className="text-[10px] font-semibold text-app-cyan hover:text-app-cyan/80 transition-colors"
                >
                  {t('common.edit')}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteItem(item.id)}
                  className="text-[10px] font-semibold text-text-muted hover:text-chart-pink transition-colors"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Container>
  );
}
