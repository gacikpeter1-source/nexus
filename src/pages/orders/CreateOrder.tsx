/**
 * Create Order Page
 * Dynamic form builder for creating custom orders
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { createOrder, getOrder, updateOrder } from '../../services/firebase/orders';
import { getUserClubs, getClub } from '../../services/firebase/clubs';
import { Timestamp } from 'firebase/firestore';
import type { OrderField, OrderFieldType } from '../../types';
import { PHOTO_PRODUCT_SIZES } from '../../types';

/**
 * Photo day order template — matches a typical team photographer's paper
 * order form (player/parent details, sport cards, and a 'photoProduct' field
 * per poster category — each one bundles its own size checkboxes rather than
 * needing a separate field per size). Built fresh each time it's applied so
 * every field gets its own unique id.
 */
function buildPhotoOrderTemplateFields(t: (key: string) => string): OrderField[] {
  let order = 0;
  const nextId = () => `field_${Date.now()}_${order}`;
  const text = (label: string, extra: Partial<OrderField> = {}): OrderField => ({
    id: nextId(), label, type: 'text', required: false, order: order++, ...extra,
  });
  const num = (label: string, extra: Partial<OrderField> = {}): OrderField => ({
    id: nextId(), label, type: 'number', required: false, min: 0, order: order++, ...extra,
  });
  const photoProduct = (label: string, sizes: readonly string[], extra: Partial<OrderField> = {}): OrderField => ({
    id: nextId(), label, type: 'photoProduct', required: false, options: [...sizes], order: order++, ...extra,
  });

  // Default prices from the photographer's standard price sheet — the
  // creator can still edit or clear any of these in the field editor below.
  // Posters are cheaper once the respondent also orders sport cards.
  const posterPrices = { A5: 8, A4: 10, A3: 12, A2: 16, A1: 22, A0: 28 };
  const posterPricesWithCards = { A5: 6, A4: 7, A3: 10, A2: 15, A1: 20, A0: 27 };
  const sportCardsTiers = [
    { minQty: 16, price: 16 },
    { minQty: 32, price: 28 },
    { minQty: 48, price: 38 },
    { minQty: 64, price: 47 },
  ];
  // Ordering enough sport cards also makes some team-poster A4 units free.
  const sportCardsFreeA4Tiers = [
    { minQty: 32, freeUnits: 1 },
    { minQty: 48, freeUnits: 2 },
  ];
  const calendarTiers = [
    { minQty: 1, price: 28 },
    { minQty: 2, price: 50 },
    { minQty: 3, price: 72 },
    { minQty: 4, price: 88 },
    { minQty: 5, price: 100 },
  ];

  const sportCardsField = num(t('orders.templates.photoOrder.sportCards'), { helpText: t('orders.templates.photoOrder.sportCardsHint'), priceTiers: sportCardsTiers });

  const fields: OrderField[] = [
    text(t('orders.templates.photoOrder.playerName'), { required: true, autofill: 'playerName' }),
    text(t('orders.templates.photoOrder.jerseyNumber')),
    text(t('orders.templates.photoOrder.position'), { helpText: t('orders.templates.photoOrder.positionHint') }),
    text(t('orders.templates.photoOrder.category'), { required: true, autofill: 'category', helpText: t('orders.templates.photoOrder.categoryHint') }),
    text(t('orders.templates.photoOrder.parentName'), { required: true }),
    text(t('orders.templates.photoOrder.phone'), { required: true, autofill: 'phone' }),
    text(t('orders.templates.photoOrder.email')),
    { ...text(t('orders.templates.photoOrder.note')), type: 'textarea' },
    sportCardsField,
    photoProduct(t('orders.templates.photoOrder.sectionIndividual'), PHOTO_PRODUCT_SIZES, {
      sizePrices: posterPrices, discountIfFieldId: sportCardsField.id, discountSizePrices: posterPricesWithCards,
    }),
    photoProduct(t('orders.templates.photoOrder.sectionTeam'), PHOTO_PRODUCT_SIZES, {
      sizePrices: posterPrices, discountIfFieldId: sportCardsField.id, discountSizePrices: posterPricesWithCards,
      freeUnitsIfFieldId: sportCardsField.id, freeUnitsSize: 'A4', freeUnitsTiers: sportCardsFreeA4Tiers,
    }),
    photoProduct(t('orders.templates.photoOrder.sectionSiblings'), PHOTO_PRODUCT_SIZES, { helpText: t('orders.templates.photoOrder.sectionSiblingsHint') }),
    photoProduct(t('orders.templates.photoOrder.sectionTeammates'), PHOTO_PRODUCT_SIZES, { helpText: t('orders.templates.photoOrder.sectionTeammatesHint') }),
    photoProduct(t('orders.templates.photoOrder.calendar'), [], { priceTiers: calendarTiers }),
  ];

  return fields;
}

export default function CreateOrder() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  // Present only on /orders/:clubId/:orderId/edit — creating a new order has
  // no orderId yet, so this doubles as the create/edit mode switch.
  const { clubId: editClubId, orderId: editOrderId } = useParams<{ clubId?: string; orderId?: string }>();
  const isEditMode = !!editOrderId;

  const [loading, setLoading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEditMode);
  const [userClubs, setUserClubs] = useState<Array<{ id: string; name: string }>>([]);
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);

  // Form state
  const [clubId, setClubId] = useState('');
  const [targetAudience, setTargetAudience] = useState<'club' | 'team'>('club');
  const [teamId, setTeamId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineHour, setDeadlineHour] = useState('12');
  const [deadlineMinute, setDeadlineMinute] = useState('00');
  const [fields, setFields] = useState<OrderField[]>([]);

  // Load clubs
  useEffect(() => {
    if (!user || isEditMode) return;

    const loadClubs = async () => {
      try {
        const clubs = await getUserClubs(user.id);
        setUserClubs(clubs.map(c => ({ id: c.id!, name: c.name })));
        if (clubs.length > 0) {
          setClubId(clubs[0].id!);
        }
      } catch (error) {
        console.error('Error loading clubs:', error);
      }
    };

    loadClubs();
  }, [user, isEditMode]);

  // Edit mode — load the existing order and prefill every field
  useEffect(() => {
    if (!isEditMode || !editClubId || !editOrderId) return;

    const loadExisting = async () => {
      setLoadingExisting(true);
      try {
        const order = await getOrder(editClubId, editOrderId);
        if (!order) throw new Error('Order not found');

        setClubId(order.clubId);
        setTargetAudience(order.targetAudience);
        setTeamId(order.teamId || '');
        setTitle(order.title);
        setDescription(order.description || '');
        const deadline = typeof order.deadline === 'string' ? new Date(order.deadline) : order.deadline.toDate();
        setDeadlineDate(deadline.toISOString().split('T')[0]);
        setDeadlineHour(deadline.getHours().toString().padStart(2, '0'));
        setDeadlineMinute((Math.round(deadline.getMinutes() / 5) * 5 % 60).toString().padStart(2, '0'));
        setFields(order.fields);
      } catch (error) {
        console.error('Error loading order for edit:', error);
        alert(t('orders.loadError'));
        navigate('/orders');
      } finally {
        setLoadingExisting(false);
      }
    };

    loadExisting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, editClubId, editOrderId]);

  // Load teams when club is selected
  useEffect(() => {
    if (!clubId) return;

    const loadTeams = async () => {
      try {
        const club = await getClub(clubId);
        if (club && club.teams) {
          setTeams(club.teams.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })));
        }
      } catch (error) {
        console.error('Error loading teams:', error);
      }
    };

    loadTeams();
  }, [clubId]);

  // Replace the field list with a built-in template's fields — only used
  // fields.length > 0 asks for confirmation first so manual work isn't lost.
  const applyTemplate = (templateFields: OrderField[], suggestedTitle: string) => {
    if (fields.length > 0 && !confirm(t('orders.templates.confirmReplace'))) return;
    setFields(templateFields);
    if (!title.trim()) setTitle(suggestedTitle);
  };

  // Add new field
  const addField = () => {
    const newField: OrderField = {
      id: `field_${Date.now()}`,
      label: '',
      type: 'text',
      required: false,
      order: fields.length,
    };
    setFields([...fields, newField]);
  };

  // Update field
  const updateField = (index: number, updates: Partial<OrderField>) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], ...updates };
    setFields(newFields);
  };

  // Remove field
  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  // Move field up/down
  const moveField = (index: number, direction: 'up' | 'down') => {
    const newFields = [...fields];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newFields.length) return;
    
    [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
    newFields[index].order = index;
    newFields[targetIndex].order = targetIndex;
    
    setFields(newFields);
  };

  // Add option to select field
  const addOption = (index: number) => {
    const newFields = [...fields];
    if (!newFields[index].options) {
      newFields[index].options = [];
    }
    newFields[index].options!.push('');
    setFields(newFields);
  };

  // Update option
  const updateOption = (fieldIndex: number, optionIndex: number, value: string) => {
    const newFields = [...fields];
    if (newFields[fieldIndex].options) {
      newFields[fieldIndex].options![optionIndex] = value;
      setFields(newFields);
    }
  };

  // Remove option
  const removeOption = (fieldIndex: number, optionIndex: number) => {
    const newFields = [...fields];
    if (newFields[fieldIndex].options) {
      newFields[fieldIndex].options!.splice(optionIndex, 1);
      setFields(newFields);
    }
  };

  // Toggle a size on/off for a 'photoProduct' field's enabled sizes
  const toggleSize = (index: number, size: string) => {
    const current = fields[index].options || [];
    const next = current.includes(size) ? current.filter(s => s !== size) : [...current, size];
    updateField(index, { options: next });
  };

  // Per-size unit price (for a 'photoProduct' field with sizes enabled)
  const updateSizePrice = (index: number, size: string, value: string) => {
    const current = { ...(fields[index].sizePrices || {}) };
    if (value === '') {
      delete current[size as keyof typeof current];
    } else {
      current[size as keyof typeof current] = Number(value);
    }
    updateField(index, { sizePrices: current });
  };

  // Discounted per-size price, applied instead of sizePrices when the linked
  // field (discountIfFieldId) has a quantity above zero
  const updateDiscountSizePrice = (index: number, size: string, value: string) => {
    const current = { ...(fields[index].discountSizePrices || {}) };
    if (value === '') {
      delete current[size as keyof typeof current];
    } else {
      current[size as keyof typeof current] = Number(value);
    }
    updateField(index, { discountSizePrices: current });
  };

  // Free-unit bonus tiers (e.g. "32 sport cards -> 1 free A4 team poster")
  const addFreeUnitTier = (index: number) => {
    const current = fields[index].freeUnitsTiers || [];
    updateField(index, { freeUnitsTiers: [...current, { minQty: 1, freeUnits: 1 }] });
  };
  const updateFreeUnitTier = (index: number, tierIndex: number, patch: { minQty?: number; freeUnits?: number }) => {
    const current = [...(fields[index].freeUnitsTiers || [])];
    current[tierIndex] = { ...current[tierIndex], ...patch };
    updateField(index, { freeUnitsTiers: current });
  };
  const removeFreeUnitTier = (index: number, tierIndex: number) => {
    const current = (fields[index].freeUnitsTiers || []).filter((_, i) => i !== tierIndex);
    updateField(index, { freeUnitsTiers: current.length > 0 ? current : undefined });
  };

  // Volume-tier pricing (for a 'number' field, or a sizeless 'photoProduct')
  const addPriceTier = (index: number) => {
    const current = fields[index].priceTiers || [];
    updateField(index, { priceTiers: [...current, { minQty: 1, price: 0 }] });
  };
  const updatePriceTier = (index: number, tierIndex: number, patch: { minQty?: number; price?: number }) => {
    const current = [...(fields[index].priceTiers || [])];
    current[tierIndex] = { ...current[tierIndex], ...patch };
    updateField(index, { priceTiers: current });
  };
  const removePriceTier = (index: number, tierIndex: number) => {
    const current = (fields[index].priceTiers || []).filter((_, i) => i !== tierIndex);
    updateField(index, { priceTiers: current.length > 0 ? current : undefined });
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !clubId || !title || !deadlineDate || !deadlineHour || !deadlineMinute || fields.length === 0) {
      alert(t('orders.fillRequired'));
      return;
    }

    // Validate fields
    for (const field of fields) {
      if (!field.label.trim()) {
        alert(t('orders.fieldLabelRequired'));
        return;
      }
      if (field.type === 'select' && (!field.options || field.options.length === 0)) {
        alert(t('orders.selectOptionsRequired'));
        return;
      }
    }

    setLoading(true);
    try {
      // Combine date, hour, and minute into 24h format time string
      const timeString = `${deadlineHour.padStart(2, '0')}:${deadlineMinute.padStart(2, '0')}`;
      const deadlineDateTime = new Date(`${deadlineDate}T${timeString}`);

      if (isEditMode && editOrderId) {
        await updateOrder(clubId, editOrderId, {
          // Every read of teamId is already gated on targetAudience ===
          // 'team' first, so a stale teamId left over from switching back to
          // "whole club" is harmless — just omit the key rather than writing
          // undefined (which Firestore rejects outright).
          ...(targetAudience === 'team' ? { teamId } : {}),
          title: title.trim(),
          description: description.trim(),
          deadline: Timestamp.fromDate(deadlineDateTime),
          fields,
          targetAudience,
        });
        navigate(`/orders/${clubId}/${editOrderId}`);
        return;
      }

      const orderData = {
        clubId,
        // Omit the key entirely rather than setting it to undefined — the
        // Firestore client SDK throws on an explicit undefined anywhere in a
        // write, which silently failed every "whole club" order (the default
        // audience) before it ever reached the database.
        ...(targetAudience === 'team' ? { teamId } : {}),
        createdBy: user.id,
        creatorName: user.displayName,
        creatorRole: user.role === 'clubOwner' ? 'clubOwner' as const :
                     user.role === 'trainer' ? 'trainer' as const :
                     'assistant' as const,
        title: title.trim(),
        description: description.trim(),
        deadline: Timestamp.fromDate(deadlineDateTime),
        status: 'active' as const,
        fields,
        targetAudience,
      };

      const orderId = await createOrder(orderData);
      navigate(`/orders/${clubId}/${orderId}`);
    } catch (error) {
      console.error(isEditMode ? 'Error updating order:' : 'Error creating order:', error);
      alert(isEditMode ? t('orders.updateError') : t('orders.createError'));
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return null;
  }

  if (loadingExisting) {
    return (
      <Container>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-app-cyan"></div>
        </div>
      </Container>
    );
  }

  const fieldTypes: { value: OrderFieldType; label: string }[] = [
    { value: 'text', label: t('orders.fieldTypes.text') },
    { value: 'number', label: t('orders.fieldTypes.number') },
    { value: 'select', label: t('orders.fieldTypes.select') },
    { value: 'textarea', label: t('orders.fieldTypes.textarea') },
    { value: 'date', label: t('orders.fieldTypes.date') },
    { value: 'file', label: t('orders.fieldTypes.file') },
    { value: 'heading', label: t('orders.fieldTypes.heading') },
    { value: 'photoProduct', label: t('orders.fieldTypes.photoProduct') },
  ];

  return (
    <Container>
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-text-primary">
            {isEditMode ? t('orders.editOrder') : t('orders.createOrder')}
          </h1>
          <button
            type="button"
            onClick={() => navigate(isEditMode ? `/orders/${clubId}/${editOrderId}` : '/orders')}
            className="text-text-secondary hover:text-text-primary"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Basic Information */}
        <div className="bg-app-card rounded-xl border border-white/10 p-6 space-y-4">
          <h2 className="text-xl font-bold text-text-primary mb-4">
            {t('orders.basicInfo')}
          </h2>

          {/* Club Selection */}
          {userClubs.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('orders.selectClub')} *
              </label>
              <select
                value={clubId}
                onChange={(e) => setClubId(e.target.value)}
                required
                className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
              >
                {userClubs.map((club) => (
                  <option key={club.id} value={club.id}>
                    {club.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Target Audience */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {t('orders.targetAudience')} *
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="club"
                  checked={targetAudience === 'club'}
                  onChange={(e) => setTargetAudience(e.target.value as 'club' | 'team')}
                  className="w-4 h-4 text-app-cyan focus:ring-app-cyan/50"
                />
                <span className="text-text-primary">{t('orders.wholeClub')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="team"
                  checked={targetAudience === 'team'}
                  onChange={(e) => setTargetAudience(e.target.value as 'club' | 'team')}
                  className="w-4 h-4 text-app-cyan focus:ring-app-cyan/50"
                />
                <span className="text-text-primary">{t('orders.specificTeam')}</span>
              </label>
            </div>
          </div>

          {/* Team Selection (if target is team) */}
          {targetAudience === 'team' && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('orders.selectTeam')} *
              </label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                required={targetAudience === 'team'}
                className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
              >
                <option value="">{t('orders.chooseTeam')}</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {t('orders.orderTitle')} *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('orders.orderTitlePlaceholder')}
              required
              className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {t('orders.description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('orders.descriptionPlaceholder')}
              rows={3}
              className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
            />
          </div>

          {/* Deadline */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('orders.deadlineDate')} *
              </label>
              <input
                type="date"
                value={deadlineDate}
                onChange={(e) => setDeadlineDate(e.target.value)}
                required
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('orders.hour')} * (0-23)
              </label>
              <select
                value={deadlineHour}
                onChange={(e) => setDeadlineHour(e.target.value)}
                required
                className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i.toString()}>
                    {i.toString().padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('orders.minute')} * (0-59)
              </label>
              <select
                value={deadlineMinute}
                onChange={(e) => setDeadlineMinute(e.target.value)}
                required
                className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
              >
                {Array.from({ length: 12 }, (_, i) => i * 5).map((min) => (
                  <option key={min} value={min.toString().padStart(2, '0')}>
                    {min.toString().padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Dynamic Fields Builder */}
        <div className="bg-app-card rounded-xl border border-white/10 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-text-primary">
              {t('orders.customFields')}
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => applyTemplate(buildPhotoOrderTemplateFields(t), t('orders.templates.photoOrder.suggestedTitle'))}
                className="px-3 py-2 text-sm bg-app-secondary border border-white/10 text-text-primary rounded-lg hover:bg-white/10 transition-all"
              >
                📋 {t('orders.templates.photoOrder.name')}
              </button>
              <button
                type="button"
                onClick={addField}
                className="px-4 py-2 bg-app-blue/20 border border-app-cyan/30 text-app-cyan rounded-lg hover:bg-app-blue/30 transition-all"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {t('orders.addField')}
                </span>
              </button>
            </div>
          </div>

          {fields.length === 0 ? (
            <div className="text-center py-8 text-text-muted">
              <p>{t('orders.noFieldsYet')}</p>
              <p className="text-sm mt-2">{t('orders.addFieldHint')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {fields.map((field, index) => (
                <div key={field.id} className="bg-app-secondary rounded-lg border border-white/10 p-3">
                  {/* Single Line Layout */}
                  <div className="flex items-center gap-2">
                    {/* Field Number */}
                    <span className="text-xs font-medium text-text-muted min-w-[30px]">
                      #{index + 1}
                    </span>

                    {/* Label Input */}
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) => updateField(index, { label: e.target.value })}
                      placeholder="Label"
                      className="flex-1 px-3 py-2 bg-app-primary border border-white/10 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
                    />

                    {/* Type Dropdown */}
                    <select
                      value={field.type}
                      onChange={(e) => updateField(index, { type: e.target.value as OrderFieldType })}
                      className="w-32 px-2 py-2 bg-app-primary border border-white/10 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
                    >
                      {fieldTypes.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>

                    {/* Required Checkbox — not meaningful for photoProduct (a
                        quantity of 0 is always a valid answer) or heading */}
                    {field.type !== 'heading' && field.type !== 'photoProduct' && (
                      <label className="flex items-center gap-1 cursor-pointer whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => updateField(index, { required: e.target.checked })}
                          className="w-4 h-4 text-app-cyan focus:ring-app-cyan/50 rounded"
                        />
                        <span className="text-xs text-text-muted">Req</span>
                      </label>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveField(index, 'up')}
                        disabled={index === 0}
                        className="p-1 text-text-muted hover:text-text-primary disabled:opacity-30"
                        title="Move up"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => moveField(index, 'down')}
                        disabled={index === fields.length - 1}
                        className="p-1 text-text-muted hover:text-text-primary disabled:opacity-30"
                        title="Move down"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeField(index)}
                        className="p-1 text-red-400 hover:text-red-300"
                        title="Remove"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Options (for dropdown type) */}
                  {field.type === 'select' && (
                    <div className="mt-2 pl-8 space-y-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-text-muted">{t('orders.options')}:</span>
                        <button
                          type="button"
                          onClick={() => addOption(index)}
                          className="text-xs text-app-cyan hover:text-app-cyan/80"
                        >
                          + {t('orders.addOption')}
                        </button>
                      </div>
                      {field.options?.map((option, optionIndex) => (
                        <div key={optionIndex} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={option}
                            onChange={(e) => updateOption(index, optionIndex, e.target.value)}
                            placeholder={`${t('orders.option')} ${optionIndex + 1}`}
                            className="flex-1 px-2 py-1 bg-app-primary border border-white/10 rounded text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-app-cyan/50"
                          />
                          <button
                            type="button"
                            onClick={() => removeOption(index, optionIndex)}
                            className="p-1 text-red-400 hover:text-red-300"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Min/Max range (for number type) */}
                  {field.type === 'number' && (
                    <div className="mt-2 pl-8 flex flex-wrap gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted">{t('orders.minValue')}:</span>
                        <input
                          type="number"
                          value={field.min ?? ''}
                          onChange={(e) => updateField(index, { min: e.target.value !== '' ? Number(e.target.value) : undefined })}
                          placeholder={t('orders.optional')}
                          className="w-24 px-2 py-1 bg-app-primary border border-white/10 rounded text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-app-cyan/50"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted">{t('orders.maxValue')}:</span>
                        <input
                          type="number"
                          value={field.max ?? ''}
                          onChange={(e) => updateField(index, { max: e.target.value !== '' ? Number(e.target.value) : undefined })}
                          placeholder={t('orders.optional')}
                          className="w-24 px-2 py-1 bg-app-primary border border-white/10 rounded text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-app-cyan/50"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted">{t('orders.stepValue')}:</span>
                        <input
                          type="number"
                          min={1}
                          value={field.step ?? ''}
                          onChange={(e) => updateField(index, { step: e.target.value !== '' ? Number(e.target.value) : undefined })}
                          placeholder={t('orders.optional')}
                          title={t('orders.stepHint')}
                          className="w-24 px-2 py-1 bg-app-primary border border-white/10 rounded text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-app-cyan/50"
                        />
                      </div>
                    </div>
                  )}

                  {/* Volume-tier pricing: for a plain number field, or for a
                      photoProduct field with no sizes enabled (single qty). */}
                  {(field.type === 'number' || (field.type === 'photoProduct' && (field.options || []).length === 0)) && (
                    <div className="mt-2 pl-8 space-y-1">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!field.priceTiers?.length}
                          onChange={(e) => updateField(index, { priceTiers: e.target.checked ? [{ minQty: 1, price: 0 }] : undefined })}
                          className="w-4 h-4 text-app-cyan focus:ring-app-cyan/50 rounded"
                        />
                        <span className="text-xs text-text-muted">💶 {t('orders.pricing.addPricing')}</span>
                      </label>
                      {!!field.priceTiers?.length && (
                        <div className="space-y-1 pt-1">
                          <p className="text-[10px] text-text-muted">{t('orders.pricing.tierHint')}</p>
                          {field.priceTiers.map((tier, tierIndex) => (
                            <div key={tierIndex} className="flex items-center gap-2">
                              <input
                                type="number"
                                min={1}
                                value={tier.minQty}
                                onChange={(e) => updatePriceTier(index, tierIndex, { minQty: Number(e.target.value) })}
                                placeholder={t('orders.pricing.tierQty')}
                                className="w-20 px-2 py-1 bg-app-primary border border-white/10 rounded text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-app-cyan/50"
                              />
                              <span className="text-xs text-text-muted">→</span>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={tier.price}
                                onChange={(e) => updatePriceTier(index, tierIndex, { price: Number(e.target.value) })}
                                placeholder={t('orders.pricing.tierPrice')}
                                className="w-24 px-2 py-1 bg-app-primary border border-white/10 rounded text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-app-cyan/50"
                              />
                              <span className="text-xs text-text-muted">€</span>
                              <button
                                type="button"
                                onClick={() => removePriceTier(index, tierIndex)}
                                className="p-1 text-red-400 hover:text-red-300"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => addPriceTier(index)}
                            className="text-xs text-app-cyan hover:text-app-cyan/80"
                          >
                            + {t('orders.pricing.addTier')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sizes (for photoProduct type) — which sizes this product comes
                      in; none checked means a single plain quantity (e.g. a
                      calendar — one format, whatever the photographer delivers). */}
                  {field.type === 'photoProduct' && (
                    <div className="mt-2 pl-8 space-y-1">
                      <span className="text-xs text-text-muted">{t('orders.photoProduct.sizesLabel')}:</span>
                      <div className="flex flex-wrap gap-3">
                        {PHOTO_PRODUCT_SIZES.map((size) => (
                          <div key={size} className="flex items-center gap-1">
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={(field.options || []).includes(size)}
                                onChange={() => toggleSize(index, size)}
                                className="w-4 h-4 text-app-cyan focus:ring-app-cyan/50 rounded"
                              />
                              <span className="text-xs text-text-primary">{size}</span>
                            </label>
                            {(field.options || []).includes(size) && (
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={field.sizePrices?.[size as keyof NonNullable<typeof field.sizePrices>] ?? ''}
                                onChange={(e) => updateSizePrice(index, size, e.target.value)}
                                placeholder="€"
                                title={t('orders.pricing.tierPrice')}
                                className="w-14 px-1 py-0.5 bg-app-primary border border-white/10 rounded text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-app-cyan/50"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                      {(field.options || []).length === 0 && (
                        <p className="text-[10px] text-text-muted">{t('orders.photoProduct.noSizesHint')}</p>
                      )}

                      {/* Conditional discount — cheaper per-size prices for anyone
                          whose answer to another field (e.g. sport cards) is above zero */}
                      {(field.options || []).length > 0 && (
                        <div className="pt-2">
                          <label className="flex items-center gap-2">
                            <span className="text-xs text-text-muted">💶 {t('orders.pricing.discountLinkLabel')}:</span>
                            <select
                              value={field.discountIfFieldId || ''}
                              onChange={(e) => updateField(index, {
                                discountIfFieldId: e.target.value || undefined,
                                discountSizePrices: e.target.value ? field.discountSizePrices : undefined,
                              })}
                              className="px-2 py-1 bg-app-primary border border-white/10 rounded text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-app-cyan/50"
                            >
                              <option value="">{t('orders.pricing.discountLinkNone')}</option>
                              {fields
                                .filter((f, i) => i !== index && (f.type === 'number' || f.type === 'photoProduct'))
                                .map((f) => (
                                  <option key={f.id} value={f.id}>{f.label || t('orders.field')}</option>
                                ))}
                            </select>
                          </label>
                          {field.discountIfFieldId && (
                            <div className="mt-1 flex flex-wrap gap-3">
                              <span className="text-[10px] text-text-muted w-full">{t('orders.pricing.discountPriceHint')}</span>
                              {PHOTO_PRODUCT_SIZES.filter((size) => (field.options || []).includes(size)).map((size) => (
                                <div key={size} className="flex items-center gap-1">
                                  <span className="text-xs text-text-primary">{size}</span>
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={field.discountSizePrices?.[size as keyof NonNullable<typeof field.discountSizePrices>] ?? ''}
                                    onChange={(e) => updateDiscountSizePrice(index, size, e.target.value)}
                                    placeholder="€"
                                    className="w-14 px-1 py-0.5 bg-app-primary border border-white/10 rounded text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-app-cyan/50"
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Free-unit bonus — ordering enough of another field makes
                          some units of one chosen size here free (e.g. the sport
                          cards price sheet's "32ks = 1 free A4 team poster") */}
                      {(field.options || []).length > 0 && (
                        <div className="pt-2">
                          <label className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-text-muted">🎁 {t('orders.pricing.freeUnitsLinkLabel')}:</span>
                            <select
                              value={field.freeUnitsIfFieldId || ''}
                              onChange={(e) => updateField(index, {
                                freeUnitsIfFieldId: e.target.value || undefined,
                                freeUnitsSize: e.target.value ? field.freeUnitsSize : undefined,
                                freeUnitsTiers: e.target.value ? field.freeUnitsTiers : undefined,
                              })}
                              className="px-2 py-1 bg-app-primary border border-white/10 rounded text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-app-cyan/50"
                            >
                              <option value="">{t('orders.pricing.discountLinkNone')}</option>
                              {fields
                                .filter((f, i) => i !== index && (f.type === 'number' || f.type === 'photoProduct'))
                                .map((f) => (
                                  <option key={f.id} value={f.id}>{f.label || t('orders.field')}</option>
                                ))}
                            </select>
                            {field.freeUnitsIfFieldId && (
                              <select
                                value={field.freeUnitsSize || ''}
                                onChange={(e) => updateField(index, { freeUnitsSize: (e.target.value || undefined) as any })}
                                className="px-2 py-1 bg-app-primary border border-white/10 rounded text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-app-cyan/50"
                              >
                                <option value="">{t('orders.pricing.freeUnitsSizePlaceholder')}</option>
                                {PHOTO_PRODUCT_SIZES.filter((size) => (field.options || []).includes(size)).map((size) => (
                                  <option key={size} value={size}>{size}</option>
                                ))}
                              </select>
                            )}
                          </label>
                          {field.freeUnitsIfFieldId && field.freeUnitsSize && (
                            <div className="space-y-1 pt-1">
                              <p className="text-[10px] text-text-muted">{t('orders.pricing.freeUnitsTierHint')}</p>
                              {(field.freeUnitsTiers || []).map((tier, tierIndex) => (
                                <div key={tierIndex} className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min={1}
                                    value={tier.minQty}
                                    onChange={(e) => updateFreeUnitTier(index, tierIndex, { minQty: Number(e.target.value) })}
                                    placeholder={t('orders.pricing.tierQty')}
                                    className="w-20 px-2 py-1 bg-app-primary border border-white/10 rounded text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-app-cyan/50"
                                  />
                                  <span className="text-xs text-text-muted">→</span>
                                  <input
                                    type="number"
                                    min={1}
                                    value={tier.freeUnits}
                                    onChange={(e) => updateFreeUnitTier(index, tierIndex, { freeUnits: Number(e.target.value) })}
                                    placeholder={t('orders.pricing.freeUnitsCount')}
                                    className="w-20 px-2 py-1 bg-app-primary border border-white/10 rounded text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-app-cyan/50"
                                  />
                                  <span className="text-xs text-text-muted">{t('orders.pricing.freeUnitsCount')}</span>
                                  <button
                                    type="button"
                                    onClick={() => removeFreeUnitTier(index, tierIndex)}
                                    className="p-1 text-red-400 hover:text-red-300"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => addFreeUnitTier(index)}
                                className="text-xs text-app-cyan hover:text-app-cyan/80"
                              >
                                + {t('orders.pricing.addTier')}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Comment (shown to respondents under the label) — hidden behind
                      a checkbox so most fields don't show an empty input by default */}
                  {field.type !== 'heading' && (
                    <div className="mt-2 pl-8 space-y-1">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={field.helpText !== undefined}
                          onChange={(e) => updateField(index, { helpText: e.target.checked ? '' : undefined })}
                          className="w-4 h-4 text-app-cyan focus:ring-app-cyan/50 rounded"
                        />
                        <span className="text-xs text-text-muted">💬 {t('orders.addComment')}</span>
                      </label>
                      {field.helpText !== undefined && (
                        <input
                          type="text"
                          value={field.helpText}
                          onChange={(e) => updateField(index, { helpText: e.target.value })}
                          placeholder={t('orders.helpTextExample')}
                          className="w-full px-2 py-1 bg-app-primary border border-white/10 rounded text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-app-cyan/50"
                        />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate(isEditMode ? `/orders/${clubId}/${editOrderId}` : '/orders')}
            className="px-6 py-3 bg-app-secondary border border-white/10 text-white rounded-lg hover:bg-white/10 transition-all"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={loading || fields.length === 0}
            className="px-6 py-3 bg-gradient-primary text-white rounded-lg hover:shadow-button-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('common.loading') : isEditMode ? t('orders.saveChanges') : t('orders.publishOrder')}
          </button>
        </div>
      </form>
    </Container>
  );
}
