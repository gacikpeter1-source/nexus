/**
 * Order Detail Page
 * Shows order details, responses, and allows CSV export
 */

import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import {
  getOrder,
  getUserResponses,
  exportOrderToCSV,
  exportOrderToCompactExcel,
  downloadCSV,
  downloadBlob,
  updateOrder,
  deleteOrder,
  deleteOrderResponse,
  subscribeToOrderResponses,
  isOrderExpired,
  getNonResponders,
  getOrderResponseColumns,
  getOrderResponseSummaryLines,
  getOrderResponseTotal,
  orderHasPricing,
  setOrderResponsePaid,
} from '../../services/firebase/orders';
import { getTeam } from '../../services/firebase/teams';
import { getClub } from '../../services/firebase/clubs';
import { getUsers } from '../../services/firebase/users';
import { getParentChildren } from '../../services/firebase/parentChild';
import type { Order, OrderResponse } from '../../types';
import { PHOTO_PRODUCT_SIZES } from '../../types';

export default function OrderDetail() {
  const { clubId, orderId } = useParams<{ clubId: string; orderId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Shown right after a successful submission (RespondToOrder navigates here
  // with ?submitted=1) — submitting used to land back here with no feedback
  // at all. Cleared from the URL immediately so a refresh doesn't re-show it.
  const [showSubmittedBanner, setShowSubmittedBanner] = useState(() => searchParams.get('submitted') === '1');
  useEffect(() => {
    if (searchParams.get('submitted') === '1') {
      setSearchParams((prev) => { prev.delete('submitted'); return prev; }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [order, setOrder] = useState<Order | null>(null);
  const [responses, setResponses] = useState<OrderResponse[]>([]);
  // Plural — a parent with several children eligible for this order holds
  // one response per child (see submitOrderResponse), not just one.
  const [userResponses, setUserResponses] = useState<OrderResponse[]>([]);
  // How many of the signed-in account's children are eligible for this
  // order (same club/team match RespondToOrder uses) — only fetched to
  // decide whether "Respond" should stay available even after the account
  // already has a response (there may be another child who hasn't), and
  // whether to hide the single-response "Edit" shortcut in favor of
  // RespondToOrder's own per-child picker.
  const [eligibleChildrenCount, setEligibleChildrenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isCreator, setIsCreator] = useState(false);
  // Any club owner/trainer/assistant can manage any order, not just the
  // account that happened to create it — matches the Firestore rules.
  const [isStaff, setIsStaff] = useState(false);
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; displayName: string }>>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  // The specific response pending delete confirmation (a parent may have
  // several — one per child — so this can't be a plain boolean anymore).
  const [deletingResponse, setDeletingResponse] = useState<OrderResponse | null>(null);
  const [showFields, setShowFields] = useState(false);
  const [togglingPaidId, setTogglingPaidId] = useState<string | null>(null);
  const [exportingCompact, setExportingCompact] = useState(false);
  const [responseSearch, setResponseSearch] = useState('');

  // Load order
  useEffect(() => {
    if (!user || !clubId || !orderId) return;

    const loadOrderData = async () => {
      setLoading(true);
      try {
        const fetchedOrder = await getOrder(clubId, orderId);
        if (!fetchedOrder) {
          throw new Error('Order not found');
        }

        setOrder(fetchedOrder);
        const creator = fetchedOrder.createdBy === user.id;
        setIsCreator(creator);

        // Fetched once and reused both for the staff check and for
        // resolving the order's intended audience (club.members) below.
        const club = await getClub(clubId);
        const staff = !creator && !!club && (
          club.ownerId === user.id ||
          (club.trainers || []).includes(user.id) ||
          (club.assistants || []).includes(user.id) ||
          user.role === 'admin'
        );
        setIsStaff(staff);
        const canManage = creator || staff;

        // The creator can also respond to their own order (e.g. a club
        // owner who's also a parent), so load their own response(s)
        // regardless of management status — not just the management view
        // below. Plural: a parent may hold one per eligible child.
        const ownResponses = await getUserResponses(clubId, orderId, user.id);
        setUserResponses(ownResponses);

        if (user.childIds?.length) {
          const allChildren = await getParentChildren(user.id);
          const eligible = allChildren.filter(
            (c) => c.clubIds?.includes(fetchedOrder.clubId) && (!fetchedOrder.teamId || c.teamIds?.includes(fetchedOrder.teamId))
          );
          setEligibleChildrenCount(eligible.length);
        }

        // Load responses (for any staff member who can manage this order)
        if (canManage) {
          // Subscribe to real-time updates
          const unsubscribe = subscribeToOrderResponses(clubId, orderId, (updatedResponses) => {
            setResponses(updatedResponses);
          });

          // Load the order's intended audience for the non-responders list —
          // the team roster for a team-targeted order, or every club member
          // for a whole-club order (same recipient resolution createOrder
          // uses for notifications) — then resolve real display names
          // instead of a placeholder.
          let audienceIds: string[] = [];
          if (fetchedOrder.targetAudience === 'team' && fetchedOrder.teamId) {
            const team = await getTeam(clubId, fetchedOrder.teamId);
            audienceIds = team ? (team.membersData ? Object.keys(team.membersData) : (team.members || [])) : [];
          } else {
            audienceIds = club?.members || [];
          }
          if (audienceIds.length > 0) {
            const audienceUsers = await getUsers(audienceIds);
            setTeamMembers(audienceUsers.map((u) => ({ id: u.id, displayName: u.displayName })));
          }

          return () => unsubscribe();
        }
      } catch (error) {
        console.error('Error loading order:', error);
        alert(t('orders.loadError'));
        navigate('/orders');
      } finally {
        setLoading(false);
      }
    };

    loadOrderData();
  }, [user, clubId, orderId, navigate, t]);

  // Export to CSV
  const handleExportCSV = () => {
    if (!order) return;

    try {
      const csvContent = exportOrderToCSV(order, responses);
      const filename = `${order.title.replace(/[^a-z0-9]/gi, '_')}_responses_${new Date().toISOString().split('T')[0]}.csv`;
      downloadCSV(csvContent, filename);
    } catch (error) {
      console.error('Error exporting CSV:', error);
      alert(t('orders.exportError'));
    }
  };

  // Pre-warm the exceljs chunk (~270KB) as soon as it's clear this person can
  // see the export button, rather than only starting the dynamic import on
  // click. On a mobile browser, the import + buffer generation can take long
  // enough that the click's "real user gesture" window has already expired
  // by the time downloadBlob() tries to trigger the file save, which some
  // mobile browsers silently refuse — shrinking that gap makes the download
  // itself fire much closer to the actual tap.
  useEffect(() => {
    if (isStaff && responses.length > 0) {
      import('exceljs').catch(() => {});
    }
  }, [isStaff, responses.length]);

  // Live filter over the response list by name, phone, email, or any other
  // plain-text answer (every field's own label differs per order, so this
  // searches every text value rather than guessing which field is "the"
  // phone/email one) — matches as you type, no separate suggestions
  // dropdown. That's deliberate: a floating overlay is exactly what went
  // wrong with the lineup assign-player sheet on mobile (parts of it ending
  // up hidden behind the keyboard). Filtering the table in place has no
  // overlay to mis-size, so it can't have that problem.
  const filteredResponses = useMemo(() => {
    const q = responseSearch.trim().toLowerCase();
    if (!q) return responses;
    return responses.filter((r) => {
      if ((r.userName || '').toLowerCase().includes(q)) return true;
      if ((r.userEmail || '').toLowerCase().includes(q)) return true;
      return Object.values(r.responses || {}).some(
        (v) => typeof v === 'string' && v.toLowerCase().includes(q)
      );
    });
  }, [responses, responseSearch]);

  // Same data, but a .xlsx file (not CSV) — only a real spreadsheet file can
  // carry column widths and wrap a long note across multiple lines, which
  // CSV has no way to express. One column per item field instead of one per
  // size, narrow enough to actually fit on one printed page.
  const handleExportCompactExcel = async () => {
    if (!order) return;

    setExportingCompact(true);
    try {
      const blob = await exportOrderToCompactExcel(order, responses);
      const filename = `${order.title.replace(/[^a-z0-9]/gi, '_')}_responses_compact_${new Date().toISOString().split('T')[0]}.xlsx`;
      downloadBlob(blob, filename);
    } catch (error) {
      console.error('Error exporting compact Excel:', error);
      const detail = error instanceof Error ? error.message : String(error);
      alert(t('orders.exportCompactExcelError', { detail }));
    } finally {
      setExportingCompact(false);
    }
  };

  // Close order
  const handleCloseOrder = async () => {
    if (!order || !user || !clubId) return;

    try {
      await updateOrder(clubId, orderId!, { status: 'closed' });
      setOrder({ ...order, status: 'closed' });
    } catch (error) {
      console.error('Error closing order:', error);
      alert(t('orders.closeError'));
    }
  };

  // Toggle a response's paid checklist mark — staff only (enforced by
  // Firestore rules too). Responses arrive via the live subscription, so no
  // local state patch is needed beyond disabling the checkbox mid-write.
  const handleTogglePaid = async (response: OrderResponse) => {
    if (!clubId || !orderId || !user || !response.id) return;
    setTogglingPaidId(response.id);
    try {
      await setOrderResponsePaid(clubId, orderId, response.id, !response.paid, user.id);
    } catch (error) {
      console.error('Error toggling paid status:', error);
      alert(t('orders.paidToggleError'));
    } finally {
      setTogglingPaidId(null);
    }
  };

  // Delete one of the user's own responses (after deadline) — stays on this
  // page rather than navigating away, since a parent may still have other
  // children's responses here.
  const handleDeleteMyResponse = async () => {
    if (!deletingResponse?.id || !user || !clubId) return;

    try {
      await deleteOrderResponse(clubId, orderId!, deletingResponse.id);
      setUserResponses((prev) => prev.filter((r) => r.id !== deletingResponse.id));
      setDeletingResponse(null);
    } catch (error) {
      console.error('Error deleting response:', error);
      alert(t('orders.deleteResponseError'));
    }
  };

  // Delete order
  const handleDeleteOrder = async () => {
    if (!order || !user || !clubId) return;

    try {
      await deleteOrder(clubId, orderId!);
      navigate('/orders');
    } catch (error) {
      console.error('Error deleting order:', error);
      alert(t('orders.deleteError'));
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

  const expired = isOrderExpired(order);
  const hasAnyResponse = userResponses.length > 0;
  // 2+ eligible children means there could always be another child without
  // a response yet, even once the account has one — so "Respond" stays
  // available instead of being replaced by a single "Edit", and which
  // specific child's response to edit becomes RespondToOrder's own picker's
  // job rather than something resolvable to one link here.
  const isMultiChild = eligibleChildrenCount >= 2;
  // The creator can respond to their own order too (e.g. a club owner who's
  // also a parent) — nothing here is restricted to non-creators.
  const canRespond = order.status === 'active' && !expired && (isMultiChild || !hasAnyResponse);
  const canEdit = order.status === 'active' && !expired && hasAnyResponse && !isMultiChild;
  const canManage = isCreator || isStaff;
  const nonResponders = canManage && teamMembers.length > 0 ? getNonResponders(teamMembers, responses) : [];

  // True when deadline was more than 3 months ago
  const deadlineDate = typeof order.deadline === 'string' ? new Date(order.deadline) : order.deadline.toDate();
  const isOldEntry = expired && deadlineDate < new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  return (
    <Container>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Back Button */}
        <button
          onClick={() => navigate('/orders')}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('common.back')}
        </button>

        {/* Submitted confirmation — shown once, right after submitting a response */}
        {showSubmittedBanner && (
          <div className="flex items-center justify-between gap-3 bg-green-500/10 border border-green-500/30 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-semibold text-green-400">{t('orders.submitSuccessTitle')}</p>
                <p className="text-sm text-text-muted">{t('orders.submitSuccessBody')}</p>
              </div>
            </div>
            <button
              onClick={() => setShowSubmittedBanner(false)}
              className="text-text-muted hover:text-text-primary flex-shrink-0"
              aria-label={t('common.close')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Order Header */}
        <div className="bg-app-card rounded-xl border border-white/10 p-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-text-primary">
                  {order.title}
                </h1>
                <span className={`px-2 py-1 rounded-full text-xs font-medium border ${
                  order.status === 'active' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                  order.status === 'closed' ? 'bg-gray-500/20 text-gray-400 border-gray-500/30' :
                  'bg-red-500/20 text-red-400 border-red-500/30'
                }`}>
                  {t(`orders.status.${order.status}`)}
                </span>
                {expired && order.status === 'active' && (
                  <span className="px-2 py-1 rounded-full text-xs font-medium border bg-red-500/20 text-red-400 border-red-500/30">
                    {t('orders.expired')}
                  </span>
                )}
              </div>

              {order.description && (
                <p className="text-text-muted mb-4">{order.description}</p>
              )}

              <div className="flex flex-wrap gap-4 text-sm text-text-muted">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span>{t('orders.createdBy')}: {order.creatorName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>{t('orders.deadline')}: {new Date(
                    typeof order.deadline === 'string' ? order.deadline : order.deadline.toDate()
                  ).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span>{responses.length} {t('orders.responses')}</span>
                </div>
                {/* Cost row — shown for every order that has any pricing configured
                    on its fields, old or new, as soon as that data exists. */}
                {orderHasPricing(order.fields) && hasAnyResponse && (
                  <div className="flex items-center gap-2 text-app-cyan font-medium">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 2v8m0 0v2m0-2c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{t('orders.yourCost')}: {userResponses.reduce((sum, r) => sum + getOrderResponseTotal(order.fields, r), 0).toFixed(2)} €</span>
                  </div>
                )}
                {orderHasPricing(order.fields) && canManage && (
                  <div className="flex items-center gap-2 text-app-cyan font-medium">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 2v8m0 0v2m0-2c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{t('orders.totalCollected')}: {responses.reduce((sum, r) => sum + getOrderResponseTotal(order.fields, r), 0).toFixed(2)} €</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {canRespond && (
                <Link
                  to={`/orders/${clubId}/${orderId}/respond`}
                  className="px-4 py-2 bg-gradient-primary text-white rounded-lg hover:shadow-button-hover transition-all"
                >
                  {t('orders.respond')}
                </Link>
              )}
              
              {canEdit && (
                <Link
                  to={`/orders/${clubId}/${orderId}/respond`}
                  className="px-4 py-2 bg-app-blue/20 border border-app-cyan/30 text-app-cyan rounded-lg hover:bg-app-blue/30 transition-all"
                >
                  {t('orders.editResponse')}
                </Link>
              )}

              {canManage && (
                <>
                  <Link
                    to={`/orders/${clubId}/${orderId}/edit`}
                    className="px-4 py-2 bg-app-secondary border border-white/10 text-white rounded-lg hover:bg-white/10 transition-all"
                  >
                    ✏️ {t('orders.editOrder')}
                  </Link>

                  <button
                    onClick={handleExportCSV}
                    disabled={responses.length === 0}
                    className="px-4 py-2 bg-app-blue/20 border border-app-cyan/30 text-app-cyan rounded-lg hover:bg-app-blue/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {t('orders.exportCSV')}
                    </span>
                  </button>

                  <button
                    onClick={handleExportCompactExcel}
                    disabled={responses.length === 0 || exportingCompact}
                    title={t('orders.exportCompactCSVHint')}
                    className="px-4 py-2 bg-app-blue/20 border border-app-cyan/30 text-app-cyan rounded-lg hover:bg-app-blue/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                      </svg>
                      {exportingCompact ? t('common.loading') : t('orders.exportCompactCSV')}
                    </span>
                  </button>

                  <Link
                    to={`/orders/${clubId}/${orderId}/payments`}
                    className="px-4 py-2 bg-app-secondary border border-white/10 text-white rounded-lg hover:bg-white/10 transition-all"
                  >
                    💶 {t('orders.payments.title')}
                  </Link>

                  {order.status === 'active' && (
                    <button
                      onClick={handleCloseOrder}
                      className="px-4 py-2 bg-app-secondary border border-white/10 text-white rounded-lg hover:bg-white/10 transition-all"
                    >
                      {t('orders.closeOrder')}
                    </button>
                  )}

                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="px-4 py-2 bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/30 transition-all"
                  >
                    {t('orders.deleteOrder')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Order Fields — collapsed by default to save space; tap to expand */}
        <div className="bg-app-card rounded-xl border border-white/10 p-6">
          <button
            type="button"
            onClick={() => setShowFields((v) => !v)}
            className="w-full flex items-center justify-between gap-3"
          >
            <h2 className="text-xl font-bold text-text-primary">
              {t('orders.requiredFields')} <span className="text-text-muted font-normal text-base">({order.fields.length})</span>
            </h2>
            <svg
              className={`w-5 h-5 text-text-muted flex-shrink-0 transition-transform ${showFields ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showFields && (
          <div className="grid gap-3 mt-4">
            {order.fields.map((field, index) => (
              <div key={field.id} className="flex items-start gap-3 p-3 bg-app-secondary rounded-lg">
                <span className="text-text-muted font-medium">{index + 1}.</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-text-primary font-medium">{field.label}</span>
                    {field.required && (
                      <span className="text-red-400 text-sm">*</span>
                    )}
                  </div>
                  <div className="text-sm text-text-muted mt-1">
                    <span className="text-app-cyan">{t(`orders.fieldTypes.${field.type}`)}</span>
                  </div>
                  {field.type === 'select' && field.options && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {field.options.map((option, i) => (
                        <span key={i} className="px-2 py-0.5 bg-app-primary border border-white/10 rounded text-xs text-text-secondary">
                          {option}
                        </span>
                      ))}
                    </div>
                  )}
                  {field.type === 'photoProduct' && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {field.options && field.options.length > 0 ? (
                        PHOTO_PRODUCT_SIZES.filter((size) => field.options!.includes(size)).map((size) => (
                          <span key={size} className="px-2 py-0.5 bg-app-primary border border-white/10 rounded text-xs text-text-secondary">
                            {size}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-text-muted">{t('orders.photoProduct.noSizesHint')}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          )}
        </div>

        {/* Your own response(s), if you've submitted any — shown even if
            you're the creator. A parent with multiple eligible children
            gets one card per child here, since each is its own response.
            Compact: only fields actually answered, skipping blanks, plus a
            total price line when the order has any pricing configured. */}
        {userResponses.map((resp) => {
          const summaryLines = getOrderResponseSummaryLines(order.fields, resp);
          const total = orderHasPricing(order.fields) ? getOrderResponseTotal(order.fields, resp) : null;
          return (
          <div key={resp.id} className="bg-app-card rounded-xl border border-white/10 p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-xl font-bold text-text-primary">
                {t('orders.yourResponse')}
                {resp.childName && <span className="text-text-secondary font-normal"> — {resp.childName}</span>}
              </h2>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                  resp.paid
                    ? 'bg-green-500/20 text-green-400 border-green-500/30'
                    : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                }`}>
                  {resp.paid ? t('orders.paid') : t('orders.notPaid')}
                </span>
                {expired && (
                  <button
                    type="button"
                    onClick={() => setDeletingResponse(resp)}
                    aria-label={t('orders.deleteMyResponse')}
                    className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/20 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <div className="divide-y divide-white/5">
              {summaryLines.map((line, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-text-secondary">{line.label}</span>
                  <span className="text-text-primary font-medium text-right">
                    {line.value}
                    {line.price !== undefined && (
                      <span className="text-text-muted ml-2">({line.price.toFixed(2)} €)</span>
                    )}
                  </span>
                </div>
              ))}
              {total !== null && (
                <div className="flex items-center justify-between gap-3 py-2 text-sm font-bold">
                  <span className="text-text-primary">{t('orders.totalPrice')}</span>
                  <span className="text-app-cyan">{total.toFixed(2)} €</span>
                </div>
              )}
            </div>
            <div className="mt-2">
              <p className="text-xs text-text-muted mt-4">
                {t('orders.submittedAt')}: {new Date(
                  typeof resp.submittedAt === 'string'
                    ? resp.submittedAt
                    : resp.submittedAt.toDate()
                ).toLocaleString()}
              </p>
              {isOldEntry && (
                <p className="text-xs text-yellow-500/70 mt-2 flex items-center gap-1">
                  <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {t('orders.oldEntry')}
                </p>
              )}
            </div>
          </div>
          );
        })}

        {/* Responses (for any club staff who can manage this order) */}
        {canManage && (
          <div className="bg-app-card rounded-xl border border-white/10 p-6">
            <h2 className="text-xl font-bold text-text-primary mb-4">
              {t('orders.allResponses')} ({responseSearch.trim() ? `${filteredResponses.length}/${responses.length}` : responses.length})
            </h2>

            {responses.length > 0 && (
              <div className="relative mb-4">
                <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                </svg>
                <input
                  type="text"
                  value={responseSearch}
                  onChange={(e) => setResponseSearch(e.target.value)}
                  placeholder={t('orders.searchResponsesPlaceholder')}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
                />
              </div>
            )}

            {responses.length === 0 ? (
              <div className="text-center py-8 text-text-muted">
                <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p>{t('orders.noResponsesYet')}</p>
              </div>
            ) : filteredResponses.length === 0 ? (
              <div className="text-center py-8 text-text-muted">
                <p>{t('orders.noSearchResults')}</p>
              </div>
            ) : (() => {
              const columns = getOrderResponseColumns(order.fields);
              const hasPricing = orderHasPricing(order.fields);
              return (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-3 px-2 text-text-secondary font-medium">
                        {t('orders.userName')}
                      </th>
                      {columns.map((column) => (
                        <th key={column.id} className="text-left py-3 px-2 text-text-secondary font-medium">
                          {column.header}
                        </th>
                      ))}
                      {hasPricing && (
                        <th className="text-left py-3 px-2 text-text-secondary font-medium">
                          {t('orders.totalPrice')}
                        </th>
                      )}
                      <th className="text-left py-3 px-2 text-text-secondary font-medium">
                        {t('orders.submittedAt')}
                      </th>
                      <th className="text-center py-3 px-2 text-text-secondary font-medium">
                        {t('orders.paid')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResponses.map((response) => (
                      <tr key={response.id} className="border-b border-white/10 hover:bg-white/5">
                        <td className="py-3 px-2 text-text-primary font-medium">
                          {response.userName}
                        </td>
                        {columns.map((column) => (
                          <td key={column.id} className="py-3 px-2 text-text-secondary">
                            {column.getValue(response) || '-'}
                          </td>
                        ))}
                        {hasPricing && (
                          <td className="py-3 px-2 text-app-cyan font-medium whitespace-nowrap">
                            {getOrderResponseTotal(order.fields, response).toFixed(2)} €
                          </td>
                        )}
                        <td className="py-3 px-2 text-text-muted text-xs">
                          {new Date(
                            typeof response.submittedAt === 'string'
                              ? response.submittedAt
                              : response.submittedAt.toDate()
                          ).toLocaleString()}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <input
                            type="checkbox"
                            checked={!!response.paid}
                            disabled={togglingPaidId === response.id}
                            onChange={() => handleTogglePaid(response)}
                            title={response.paid ? t('orders.paid') : t('orders.notPaid')}
                            className="w-4 h-4 text-app-cyan focus:ring-app-cyan/50 rounded cursor-pointer disabled:opacity-50"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              );
            })()}

            {/* Non-responders */}
            {nonResponders.length > 0 && (
              <div className="mt-6 pt-6 border-t border-white/10">
                <h3 className="text-lg font-bold text-text-primary mb-3">
                  {t('orders.notResponded')} ({nonResponders.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {nonResponders.map((member) => (
                    <span
                      key={member.id}
                      className="px-3 py-1 bg-red-500/20 border border-red-500/30 text-red-400 rounded-full text-sm"
                    >
                      {member.displayName}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Delete My Response Modal */}
        {deletingResponse && (
          <>
            <div className="fixed inset-0 bg-black/70 z-50" onClick={() => setDeletingResponse(null)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-app-card rounded-xl border border-white/10 p-6 max-w-md w-full">
                <h3 className="text-xl font-bold text-text-primary mb-3">
                  {t('orders.confirmDeleteResponse')}
                  {deletingResponse.childName && <span className="text-text-secondary font-normal"> — {deletingResponse.childName}</span>}
                </h3>
                <p className="text-text-muted mb-2">
                  {t('orders.confirmDeleteResponseDescription')}
                </p>
                {isOldEntry && (
                  <p className="text-xs text-yellow-500/70 mb-4 flex items-center gap-1">
                    <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {t('orders.oldEntry')}
                  </p>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => setDeletingResponse(null)}
                    className="flex-1 px-4 py-2 bg-app-secondary border border-white/10 text-white rounded-lg hover:bg-white/10 transition-all"
                  >
                    {t('orders.keepForEvidence')}
                  </button>
                  <button
                    onClick={handleDeleteMyResponse}
                    className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all"
                  >
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <>
            <div className="fixed inset-0 bg-black/70 z-50" onClick={() => setShowDeleteModal(false)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-app-card rounded-xl border border-white/10 p-6 max-w-md w-full">
                <h3 className="text-xl font-bold text-text-primary mb-4">
                  {t('orders.confirmDelete')}
                </h3>
                <p className="text-text-muted mb-6">
                  {t('orders.confirmDeleteDescription')}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteModal(false)}
                    className="flex-1 px-4 py-2 bg-app-secondary border border-white/10 text-white rounded-lg hover:bg-white/10 transition-all"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleDeleteOrder}
                    className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all"
                  >
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Container>
  );
}
