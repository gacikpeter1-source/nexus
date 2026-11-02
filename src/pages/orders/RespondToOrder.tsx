/**
 * Respond to Order Page
 * User form for submitting order responses
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { getOrder, getUserResponses, submitOrderResponse, linkOrderResponseToChild, uploadOrderFile } from '../../services/firebase/orders';
import { getParentChildren } from '../../services/firebase/parentChild';
import { getClub } from '../../services/firebase/clubs';
import { getTeamMembers } from '../../services/firebase/teams';
import type { Order, OrderResponse, OrderField, User } from '../../types';
import { PHOTO_PRODUCT_SIZES, PHOTO_PRODUCT_NO_SIZE_KEY } from '../../types';

type AutofillResolution =
  | { kind: 'auto'; value: string }
  | { kind: 'choice'; options: string[] }
  | { kind: 'manual' };

export default function RespondToOrder() {
  const { clubId, orderId } = useParams<{ clubId: string; orderId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [order, setOrder] = useState<Order | null>(null);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [files, setFiles] = useState<Record<string, File>>({});
  const [fileUploads, setFileUploads] = useState<Record<string, string>>({});
  const [existingResponse, setExistingResponse] = useState<OrderResponse | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // Prefill inputs — resolved once on load, used to auto-fill autofill-tagged
  // fields (see resolveAutofill below) instead of asking the respondent to
  // retype what the app already knows.
  const [children, setChildren] = useState<User[]>([]);
  const [orderTeamName, setOrderTeamName] = useState<string | null>(null);
  const [userTeamNames, setUserTeamNames] = useState<string[]>([]);
  const [confirmedPrefill, setConfirmedPrefill] = useState(false);
  const prefillCardRef = useRef<HTMLDivElement>(null);

  // Every response the signed-in account has already submitted for this
  // order — a parent with 2+ eligible children can hold one per child, not
  // just one total (see submitOrderResponse). Drives the "which child is
  // this for?" picker below whenever there's more than one to choose from.
  const [myResponses, setMyResponses] = useState<OrderResponse[]>([]);
  // The child this form is currently filled out for. Auto-set immediately
  // for the 0-or-1-eligible-child case (no picker needed there); null while
  // the 2+ picker is showing and nothing's been picked yet.
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  // A pre-existing response not yet linked to any child (e.g. submitted
  // before this feature existed) that the respondent is in the middle of
  // assigning to one of their children, from the picker.
  const [linkingResponse, setLinkingResponse] = useState<OrderResponse | null>(null);

  const selectedChild = children.find((c) => c.id === selectedChildId) || null;

  // Fills the form for a specific child context — either that child's (or,
  // when child is null, the account's own non-child) existing answers, or
  // first-time prefill defaults. Only ever called right after loading or
  // right after the respondent picks who this is for, never mid-edit, so
  // there's nothing already in `responses` worth preserving.
  const applyChildContext = (
    child: User | null,
    allResponses: OrderResponse[],
    fetchedOrder: Order,
    resolvedTeamName: string | null,
    resolvedUserTeamNames: string[],
    totalEligibleChildren: number
  ) => {
    setSelectedChildId(child?.id ?? null);
    // A legacy (pre-this-feature) response has no childId at all — for an
    // only child, that untagged response can only ever have been theirs, so
    // treat it as a match too (and it'll pick up a childId the next time it's
    // saved). With 2+ children it's genuinely ambiguous, so it's left for
    // the picker's separate "assign to a child" step instead.
    const existing = child
      ? allResponses.find((r) => r.childId === child.id) ||
        (totalEligibleChildren <= 1 ? allResponses.find((r) => !r.childId) : undefined) ||
        null
      : allResponses.find((r) => !r.childId) || null;

    setExistingResponse(existing);
    setFieldErrors({});
    setConfirmedPrefill(false);

    if (existing) {
      setResponses(existing.responses);
      setFileUploads(existing.fileUploads || {});
    } else {
      setFileUploads({});
      const prefilled: Record<string, any> = {};
      for (const field of fetchedOrder.fields) {
        if (field.autofill === 'playerName' && child) {
          prefilled[field.id] = child.displayName;
        } else if (field.autofill === 'phone' && user?.phoneNumber) {
          prefilled[field.id] = user.phoneNumber;
        } else if (field.autofill === 'email' && user?.email) {
          prefilled[field.id] = user.email;
        } else if (field.autofill === 'category') {
          if (resolvedTeamName) prefilled[field.id] = resolvedTeamName;
          else if (resolvedUserTeamNames.length === 1) prefilled[field.id] = resolvedUserTeamNames[0];
        }
      }
      setResponses(prefilled);
    }
  };

  // Back out of editing a specific child's response to the 2+ children
  // picker list.
  const backToPicker = () => {
    setSelectedChildId(null);
    setExistingResponse(null);
    setResponses({});
    setFiles({});
    setFileUploads({});
    setFieldErrors({});
    setConfirmedPrefill(false);
  };

  // Load order and existing response(s)
  useEffect(() => {
    if (!user || !clubId || !orderId) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const fetchedOrder = await getOrder(clubId, orderId);
        if (!fetchedOrder) {
          throw new Error('Order not found');
        }

        setOrder(fetchedOrder);

        // Resolve autofill inputs from the order's own club/team.
        let resolvedTeamName: string | null = null;
        let resolvedUserTeamNames: string[] = [];
        let resolvedChildren: User[] = [];
        try {
          const club = await getClub(fetchedOrder.clubId);
          if (club?.teams) {
            if (fetchedOrder.teamId) {
              resolvedTeamName = club.teams.find((t: any) => t.id === fetchedOrder.teamId)?.name || null;
            } else {
              resolvedUserTeamNames = club.teams
                .filter((t: any) => Object.keys(getTeamMembers(t)).includes(user.id))
                .map((t: any) => t.name);
            }
          }
          if (user.childIds?.length) {
            const allChildren = await getParentChildren(user.id);
            resolvedChildren = allChildren.filter(c =>
              c.clubIds?.includes(fetchedOrder.clubId) &&
              (!fetchedOrder.teamId || c.teamIds?.includes(fetchedOrder.teamId))
            );
          }
        } catch (err) {
          console.error('RespondToOrder: prefill resolution failed', err);
        }
        setOrderTeamName(resolvedTeamName);
        setUserTeamNames(resolvedUserTeamNames);
        setChildren(resolvedChildren);

        // Every response this account has already submitted, across every
        // child.
        const ownResponses = await getUserResponses(clubId, orderId, user.id);
        setMyResponses(ownResponses);

        // 0 or 1 eligible child: resolve the form straight away, same as
        // before this feature existed. 2+: leave it unresolved — the picker
        // (rendered below once loading is done) takes over until the
        // respondent picks who this is for.
        if (resolvedChildren.length <= 1) {
          applyChildContext(resolvedChildren[0] || null, ownResponses, fetchedOrder, resolvedTeamName, resolvedUserTeamNames, resolvedChildren.length);
        }
      } catch (error) {
        console.error('Error loading order:', error);
        alert(t('orders.loadError'));
        navigate('/orders');
      } finally {
        setLoading(false);
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, clubId, orderId, navigate, t]);

  // Assign a pre-existing, not-yet-linked response to one of the account's
  // children, then switch straight into editing it.
  const handleLinkToChild = async (child: User) => {
    if (!linkingResponse?.id || !clubId || !orderId || !order) return;
    try {
      await linkOrderResponseToChild(clubId, orderId, linkingResponse.id, child.id, child.displayName);
      const updated = myResponses.map((r) =>
        r.id === linkingResponse.id ? { ...r, childId: child.id, childName: child.displayName } : r
      );
      setMyResponses(updated);
      setLinkingResponse(null);
      applyChildContext(child, updated, order, orderTeamName, userTeamNames, children.length);
    } catch (error) {
      console.error('Error linking response to child:', error);
      alert(t('orders.linkResponseError'));
    }
  };

  // Where a given autofill-tagged field's value comes from — a single known
  // value (auto, shown read-only + needs the confirmation checkbox), a short
  // list to pick from (choice), or nothing resolvable (falls back to a
  // normal manual input, same as a field with no autofill tag at all).
  const resolveAutofill = (field: OrderField): AutofillResolution => {
    // Which child this response is for is now resolved up front — by the
    // 2+ children picker, or automatically for 0/1 — so there's no longer
    // any ambiguity left for this field to offer a choice between.
    if (field.autofill === 'playerName') {
      if (selectedChild) return { kind: 'auto', value: selectedChild.displayName };
      return { kind: 'manual' };
    }
    if (field.autofill === 'phone') {
      return user?.phoneNumber ? { kind: 'auto', value: user.phoneNumber } : { kind: 'manual' };
    }
    if (field.autofill === 'category') {
      if (orderTeamName) return { kind: 'auto', value: orderTeamName };
      if (userTeamNames.length === 1) return { kind: 'auto', value: userTeamNames[0] };
      if (userTeamNames.length > 1) return { kind: 'choice', options: userTeamNames };
      return { kind: 'manual' };
    }
    // 'email' falls through to 'manual' deliberately — it's pre-filled into
    // the editable input via the loadData effect above instead of shown
    // read-only, so no confirmation checkbox is forced for it.
    return { kind: 'manual' };
  };

  const autofillFields = order?.fields.filter(f => f.autofill) || [];
  const needsPrefillConfirmation = autofillFields.some(f => resolveAutofill(f).kind === 'auto');

  // Handle field change
  const handleFieldChange = (fieldId: string, value: any) => {
    setResponses((prev) => ({
      ...prev,
      [fieldId]: value,
    }));
  };

  // Update one size's quantity within a 'photoProduct' field's response —
  // stored as { [size]: value, ... }, or { [PHOTO_PRODUCT_NO_SIZE_KEY]: value }
  // when the field has no sizes configured (a single plain quantity).
  const handlePhotoProductChange = (fieldId: string, sizeKey: string, value: string) => {
    if (value !== '' && !/^\d+$/.test(value)) return;
    setResponses((prev) => ({
      ...prev,
      [fieldId]: { ...(prev[fieldId] || {}), [sizeKey]: value },
    }));
  };

  // Handle file selection
  const handleFileSelect = (fieldId: string, file: File | null) => {
    if (file) {
      setFiles((prev) => ({
        ...prev,
        [fieldId]: file,
      }));
    } else {
      const newFiles = { ...files };
      delete newFiles[fieldId];
      setFiles(newFiles);
    }
  };

  // Inline range/step check for a single number field — called on every keystroke
  const validateNumberField = (fieldId: string, min: number | undefined, max: number | undefined, step: number | undefined, value: string) => {
    if (!value || value.trim() === '') {
      setFieldErrors((prev) => { const e = { ...prev }; delete e[fieldId]; return e; });
      return;
    }
    const num = Number(value);
    if (min !== undefined && num < min) {
      setFieldErrors((prev) => ({ ...prev, [fieldId]: `${t('orders.valueTooLow')} ${min}` }));
    } else if (max !== undefined && num > max) {
      setFieldErrors((prev) => ({ ...prev, [fieldId]: `${t('orders.valueTooHigh')} ${max}` }));
    } else if (step !== undefined && step > 0 && num % step !== 0) {
      setFieldErrors((prev) => ({ ...prev, [fieldId]: `${t('orders.valueMustBeMultipleOf')} ${step}` }));
    } else {
      setFieldErrors((prev) => { const e = { ...prev }; delete e[fieldId]; return e; });
    }
  };

  // Validate form
  const validateForm = (): boolean => {
    if (!order) return false;

    if (needsPrefillConfirmation && !confirmedPrefill) {
      prefillCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      alert(t('orders.prefill.checkboxRequired'));
      return false;
    }

    for (const field of order.fields) {
      if (field.required) {
        const value = responses[field.id];
        
        if (field.type === 'file') {
          // Check if file exists or was already uploaded
          if (!files[field.id] && !fileUploads[field.id]) {
            alert(t('orders.fieldRequired', { field: field.label }));
            return false;
          }
        } else {
          if (value === undefined || value === null || String(value).trim() === '') {
            alert(t('orders.fieldRequired', { field: field.label }));
            return false;
          }
        }
      }

      // Validate number range (even for non-required fields that have a value)
      if (field.type === 'number') {
        const value = responses[field.id];
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          const num = Number(value);
          if (field.min !== undefined && num < field.min) {
            alert(`${field.label}: ${t('orders.valueTooLow')} ${field.min}`);
            return false;
          }
          if (field.max !== undefined && num > field.max) {
            alert(`${field.label}: ${t('orders.valueTooHigh')} ${field.max}`);
            return false;
          }
          if (field.step !== undefined && field.step > 0 && num % field.step !== 0) {
            alert(`${field.label}: ${t('orders.valueMustBeMultipleOf')} ${field.step}`);
            return false;
          }
        }
      }

    }

    return true;
  };

  // Upload files
  const uploadFiles = async (clubId: string): Promise<Record<string, string>> => {
    const uploadedFiles: Record<string, string> = { ...fileUploads };

    for (const [fieldId, file] of Object.entries(files)) {
      try {
        const url = await uploadOrderFile(clubId, orderId!, user!.id, file);
        uploadedFiles[fieldId] = url;
      } catch (error) {
        console.error(`Error uploading file for field ${fieldId}:`, error);
        throw new Error(t('orders.fileUploadError'));
      }
    }

    return uploadedFiles;
  };

  // Submit response
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !order || !clubId || !orderId) return;

    if (!validateForm()) return;

    setSubmitting(true);
    setUploadingFiles(true);

    try {
      // Upload files first
      const uploadedFiles = await uploadFiles(clubId);
      setUploadingFiles(false);

      // Submit response — tagged to the selected child, if this account has
      // any eligible ones, so a second (or third) child's response doesn't
      // overwrite the first (see submitOrderResponse).
      const responseData = {
        orderId,
        userId: user.id,
        userName: user.displayName,
        userEmail: user.email,
        responses,
        fileUploads: uploadedFiles,
        ...(selectedChild ? { childId: selectedChild.id, childName: selectedChild.displayName } : {}),
      };

      await submitOrderResponse(clubId, orderId, responseData);

      // Navigate back to order detail with a flag that shows a clear
      // "submitted" confirmation there — submitting used to go straight back
      // with no feedback at all.
      navigate(`/orders/${clubId}/${orderId}?submitted=1`);
    } catch (error) {
      console.error('Error submitting response:', error);
      alert(t('orders.submitError'));
    } finally {
      setSubmitting(false);
      setUploadingFiles(false);
    }
  };

  if (loading) {
    return (
      <Container>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-app-cyan"></div>
        </div>
      </Container>
    );
  }

  if (!order) {
    return null;
  }

  const expired = new Date() > new Date(
    typeof order.deadline === 'string' ? order.deadline : order.deadline.toDate()
  );

  if (expired && order.status === 'active') {
    return (
      <Container>
        <div className="max-w-2xl mx-auto text-center py-12">
          <svg className="w-16 h-16 mx-auto mb-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-2xl font-bold text-text-primary mb-2">
            {t('orders.orderExpired')}
          </h2>
          <p className="text-text-muted mb-6">
            {t('orders.orderExpiredDescription')}
          </p>
          <button
            onClick={() => navigate('/orders')}
            className="px-6 py-3 bg-gradient-primary text-white rounded-lg hover:shadow-button-hover transition-all"
          >
            {t('orders.backToOrders')}
          </button>
        </div>
      </Container>
    );
  }

  // Which child is this for? Shown whenever there are 2+ eligible children
  // and none has been picked yet (or, for a pre-existing unlinked response,
  // which child it belongs to) — a plain inline list on the page, not a
  // floating overlay, so there's nothing that can end up hidden behind the
  // keyboard or mis-sized against the viewport.
  if (children.length >= 2 && !selectedChildId) {
    const legacyResponses = myResponses.filter((r) => !r.childId);
    const unassignedChildren = children.filter((c) => !myResponses.some((r) => r.childId === c.id));

    return (
      <Container>
        <div className="max-w-2xl mx-auto space-y-6">
          <button
            type="button"
            onClick={() => (linkingResponse ? setLinkingResponse(null) : navigate(`/orders/${clubId}/${orderId}`))}
            className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t('common.back')}
          </button>

          <div className="bg-app-card rounded-xl border border-white/10 p-6">
            {linkingResponse ? (
              <>
                <h1 className="text-xl font-bold text-text-primary mb-1">{t('orders.whichChild.linkTitle')}</h1>
                <p className="text-sm text-text-muted mb-4">{t('orders.whichChild.linkHint')}</p>
                <div className="space-y-2">
                  {unassignedChildren.map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => handleLinkToChild(child)}
                      className="w-full p-4 bg-app-secondary rounded-xl border border-white/10 hover:border-app-cyan/40 transition-colors text-left font-medium text-text-primary"
                    >
                      {child.displayName}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-text-primary mb-1">{t('orders.whichChild.title')}</h1>
                <h2 className="text-lg text-text-secondary mb-4">{order.title}</h2>
                <div className="space-y-2">
                  {children.map((child) => {
                    const done = myResponses.some((r) => r.childId === child.id);
                    return (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => applyChildContext(child, myResponses, order, orderTeamName, userTeamNames, children.length)}
                        className="w-full flex items-center justify-between gap-3 p-4 bg-app-secondary rounded-xl border border-white/10 hover:border-app-cyan/40 transition-colors text-left"
                      >
                        <span className="font-medium text-text-primary">{child.displayName}</span>
                        <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium border ${
                          done
                            ? 'bg-green-500/20 text-green-400 border-green-500/30'
                            : 'bg-app-primary text-text-muted border-white/10'
                        }`}>
                          {done ? t('orders.whichChild.completed') : t('orders.whichChild.notStarted')}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {legacyResponses.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-white/10">
                    <p className="text-xs text-text-muted mb-3">{t('orders.whichChild.unassignedHint')}</p>
                    <div className="space-y-2">
                      {legacyResponses.map((resp) => (
                        <button
                          key={resp.id}
                          type="button"
                          onClick={() => setLinkingResponse(resp)}
                          className="w-full flex items-center justify-between gap-3 p-4 bg-app-secondary rounded-xl border border-dashed border-white/20 hover:border-app-cyan/40 transition-colors text-left"
                        >
                          <span className="text-text-secondary text-sm">{t('orders.whichChild.unassignedResponse')}</span>
                          <span className="text-xs text-app-cyan flex-shrink-0">{t('orders.whichChild.assignCta')}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
        {/* Back Button */}
        <button
          type="button"
          onClick={() => (children.length >= 2 ? backToPicker() : navigate(`/orders/${clubId}/${orderId}`))}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {children.length >= 2 ? t('orders.whichChild.backToList') : t('common.back')}
        </button>

        {/* Header */}
        <div className="bg-app-card rounded-xl border border-white/10 p-6">
          <h1 className="text-2xl font-bold text-text-primary mb-2">
            {existingResponse ? t('orders.editYourResponse') : t('orders.respondToOrder')}
            {selectedChild && <span className="text-text-secondary font-normal"> — {selectedChild.displayName}</span>}
          </h1>
          <h2 className="text-xl text-text-secondary mb-4">{order.title}</h2>
          {order.description && (
            <p className="text-text-muted mb-4">{order.description}</p>
          )}
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>{t('orders.deadline')}: {new Date(
              typeof order.deadline === 'string' ? order.deadline : order.deadline.toDate()
            ).toLocaleString()}</span>
          </div>
        </div>

        {/* Your details — resolved from your profile instead of retyped */}
        {autofillFields.length > 0 && (
          <div ref={prefillCardRef} className="bg-app-card rounded-xl border border-white/10 p-6 space-y-4">
            <h2 className="text-lg font-bold text-text-primary">{t('orders.prefill.title')}</h2>
            {autofillFields.map((field) => {
              const resolution = resolveAutofill(field);
              return (
                <div key={field.id}>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    {field.label}
                    {field.required && <span className="text-red-400 ml-1">*</span>}
                  </label>
                  {resolution.kind === 'auto' ? (
                    <p className="px-4 py-3 bg-app-secondary border border-white/10 rounded-lg text-text-primary">
                      {resolution.value}
                    </p>
                  ) : resolution.kind === 'choice' ? (
                    <select
                      value={responses[field.id] || ''}
                      onChange={(e) => handleFieldChange(field.id, e.target.value)}
                      required={field.required}
                      className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
                    >
                      <option value="">{t('orders.selectOption')}</option>
                      {resolution.options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={responses[field.id] || ''}
                      onChange={(e) => handleFieldChange(field.id, e.target.value)}
                      required={field.required}
                      className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
                    />
                  )}
                  {field.helpText && <p className="text-xs text-text-muted mt-1">{field.helpText}</p>}
                </div>
              );
            })}
            {needsPrefillConfirmation && (
              <label className={`flex items-start gap-2 cursor-pointer p-3 rounded-lg border transition-colors ${
                confirmedPrefill
                  ? 'border-white/10 bg-app-secondary'
                  : 'border-app-cyan/50 bg-app-cyan/10'
              }`}>
                <input
                  type="checkbox"
                  checked={confirmedPrefill}
                  onChange={(e) => setConfirmedPrefill(e.target.checked)}
                  className="w-5 h-5 mt-0.5 text-app-cyan focus:ring-app-cyan/50 rounded flex-shrink-0"
                />
                <span className="text-sm font-medium text-text-primary">{t('orders.prefill.checkboxLabel')}</span>
              </label>
            )}
          </div>
        )}

        {/* Form Fields */}
        <div className="bg-app-card rounded-xl border border-white/10 p-6 space-y-6">
          {order.fields.filter((field) => !field.autofill).map((field) => (
            field.type === 'heading' ? (
              <div key={field.id} className="pt-2 border-t border-white/10 first:border-t-0 first:pt-0">
                <h3 className="text-base font-bold text-text-primary">{field.label}</h3>
                {field.helpText && <p className="text-xs text-text-muted mt-0.5">{field.helpText}</p>}
              </div>
            ) : (
            <div key={field.id}>
              <label className="block text-sm font-medium text-text-primary mb-2">
                {field.label}
                {field.required && <span className="text-red-400 ml-1">*</span>}
                <span className="text-xs text-text-muted ml-2">({t(`orders.fieldTypes.${field.type}`)})</span>
              </label>
              {field.helpText && <p className="text-xs text-text-muted -mt-1 mb-2">{field.helpText}</p>}

              {/* Text Input */}
              {field.type === 'text' && (
                <input
                  type="text"
                  value={responses[field.id] || ''}
                  onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  required={field.required}
                  className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
                />
              )}

              {/* Number Input */}
              {field.type === 'number' && (
                <div>
                  <input
                    type="text"
                    value={responses[field.id] || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '' || /^\d+$/.test(value)) {
                        handleFieldChange(field.id, value);
                        validateNumberField(field.id, field.min, field.max, field.step, value);
                      }
                    }}
                    required={field.required}
                    pattern="\d*"
                    inputMode="numeric"
                    className={`w-full px-4 py-3 bg-app-secondary border rounded-lg text-text-primary focus:outline-none focus:ring-2 transition-colors ${
                      fieldErrors[field.id]
                        ? 'border-red-500/60 focus:ring-red-500/40'
                        : 'border-white/10 focus:ring-app-cyan/50'
                    }`}
                  />
                  {fieldErrors[field.id] ? (
                    <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                      <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      {fieldErrors[field.id]}
                      {field.min !== undefined && field.max !== undefined && (
                        <span className="text-text-muted">({t('orders.range')}: {field.min} – {field.max})</span>
                      )}
                    </p>
                  ) : (field.min !== undefined || field.max !== undefined || field.step !== undefined) && (
                    <p className="text-xs text-text-muted mt-1">
                      {[
                        field.min !== undefined && field.max !== undefined
                          ? `${t('orders.range')}: ${field.min} – ${field.max}`
                          : field.min !== undefined
                          ? `${t('orders.minValue')}: ${field.min}`
                          : field.max !== undefined
                          ? `${t('orders.maxValue')}: ${field.max}`
                          : null,
                        field.step !== undefined ? `${t('orders.stepHint')} ${field.step}` : null,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              )}

              {/* Select */}
              {field.type === 'select' && (
                <select
                  value={responses[field.id] || ''}
                  onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  required={field.required}
                  className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
                >
                  <option value="">{t('orders.selectOption')}</option>
                  {field.options?.map((option, index) => (
                    <option key={index} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              )}

              {/* Textarea */}
              {field.type === 'textarea' && (
                <textarea
                  value={responses[field.id] || ''}
                  onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  required={field.required}
                  rows={4}
                  className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
                />
              )}

              {/* Date */}
              {field.type === 'date' && (
                <input
                  type="date"
                  value={responses[field.id] || ''}
                  onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  required={field.required}
                  className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
                />
              )}

              {/* File Upload */}
              {field.type === 'file' && (
                <div>
                  <input
                    type="file"
                    onChange={(e) => handleFileSelect(field.id, e.target.files?.[0] || null)}
                    className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-cyan/50 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-app-blue/20 file:text-app-cyan hover:file:bg-app-blue/30"
                  />
                  {fileUploads[field.id] && (
                    <p className="text-xs text-green-400 mt-2">
                      ✓ {t('orders.fileAlreadyUploaded')}
                    </p>
                  )}
                  {files[field.id] && (
                    <p className="text-xs text-text-muted mt-2">
                      {t('orders.selectedFile')}: {files[field.id].name}
                    </p>
                  )}
                </div>
              )}

              {/* Photo product — one number input per enabled size, or a single
                  plain quantity when the creator checked no sizes at all */}
              {field.type === 'photoProduct' && (
                (field.options && field.options.length > 0) ? (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {PHOTO_PRODUCT_SIZES.filter((size) => field.options!.includes(size)).map((size) => (
                      <div key={size}>
                        <label className="block text-xs text-text-muted mb-1 text-center">{size}</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="\d*"
                          value={responses[field.id]?.[size] || ''}
                          onChange={(e) => handlePhotoProductChange(field.id, size, e.target.value)}
                          placeholder="0"
                          className="w-full px-2 py-2 bg-app-secondary border border-white/10 rounded-lg text-text-primary text-center focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d*"
                    value={responses[field.id]?.[PHOTO_PRODUCT_NO_SIZE_KEY] || ''}
                    onChange={(e) => handlePhotoProductChange(field.id, PHOTO_PRODUCT_NO_SIZE_KEY, e.target.value)}
                    placeholder="0"
                    className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
                  />
                )
              )}
            </div>
            )
          ))}
        </div>

        {/* Submit Button */}
        <div className="flex flex-col items-end gap-2">
          {needsPrefillConfirmation && !confirmedPrefill && (
            <button
              type="button"
              onClick={() => prefillCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="text-xs text-app-cyan hover:text-app-cyan/80 underline"
            >
              ☝️ {t('orders.prefill.pendingHint')}
            </button>
          )}
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => (children.length >= 2 ? backToPicker() : navigate(`/orders/${clubId}/${orderId}`))}
              className="px-6 py-3 bg-app-secondary border border-white/10 text-white rounded-lg hover:bg-white/10 transition-all"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting || Object.keys(fieldErrors).length > 0 || (needsPrefillConfirmation && !confirmedPrefill)}
              className="px-6 py-3 bg-gradient-primary text-white rounded-lg hover:shadow-button-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploadingFiles
                ? t('orders.uploadingFiles')
                : submitting
                ? t('common.loading')
                : existingResponse
                ? t('orders.updateResponse')
                : t('orders.submitResponse')}
            </button>
          </div>
        </div>
      </form>
    </Container>
  );
}
