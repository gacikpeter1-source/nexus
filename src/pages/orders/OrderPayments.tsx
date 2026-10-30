/**
 * Order Payment Checklist
 * A focused, staff-only page: every respondent, what they owe, and a
 * checkbox to mark them paid — separate from the full order detail page's
 * much busier response table.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import {
  getOrder,
  subscribeToOrderResponses,
  getOrderResponseTotal,
  setOrderResponsePaid,
} from '../../services/firebase/orders';
import { getClub } from '../../services/firebase/clubs';
import type { Order, OrderResponse } from '../../types';

export default function OrderPayments() {
  const { clubId, orderId } = useParams<{ clubId: string; orderId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [order, setOrder] = useState<Order | null>(null);
  const [responses, setResponses] = useState<OrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user || !clubId || !orderId) return;

    let unsubscribe: (() => void) | undefined;

    const load = async () => {
      setLoading(true);
      try {
        const fetchedOrder = await getOrder(clubId, orderId);
        if (!fetchedOrder) throw new Error('Order not found');

        const creator = fetchedOrder.createdBy === user.id;
        const club = !creator ? await getClub(clubId) : null;
        const staff = creator || (!!club && (
          club.ownerId === user.id ||
          (club.trainers || []).includes(user.id) ||
          (club.assistants || []).includes(user.id) ||
          user.role === 'admin'
        ));

        if (!staff) {
          alert(t('orders.payments.staffOnly'));
          navigate(`/orders/${clubId}/${orderId}`);
          return;
        }

        setOrder(fetchedOrder);
        unsubscribe = subscribeToOrderResponses(clubId, orderId, setResponses);
      } catch (error) {
        console.error('Error loading payment checklist:', error);
        alert(t('orders.loadError'));
        navigate('/orders');
      } finally {
        setLoading(false);
      }
    };

    load();
    return () => unsubscribe?.();
  }, [user, clubId, orderId, navigate, t]);

  const handleToggle = async (response: OrderResponse) => {
    if (!clubId || !orderId || !user || !response.id) return;
    setTogglingId(response.id);
    try {
      await setOrderResponsePaid(clubId, orderId, response.id, !response.paid, user.id);
    } catch (error) {
      console.error('Error toggling paid status:', error);
      alert(t('orders.paidToggleError'));
    } finally {
      setTogglingId(null);
    }
  };

  if (loading || !order) {
    return (
      <Container>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-app-cyan"></div>
        </div>
      </Container>
    );
  }

  const sorted = [...responses].sort((a, b) => a.userName.localeCompare(b.userName));
  const paidCount = sorted.filter((r) => r.paid).length;
  const totalAll = sorted.reduce((sum, r) => sum + getOrderResponseTotal(order.fields, r), 0);
  const totalPaid = sorted.filter((r) => r.paid).reduce((sum, r) => sum + getOrderResponseTotal(order.fields, r), 0);
  const filtered = search.trim()
    ? sorted.filter((r) => r.userName.toLowerCase().includes(search.trim().toLowerCase()))
    : sorted;

  return (
    <Container>
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Link to={`/orders/${clubId}/${orderId}`} className="text-xs text-app-cyan hover:text-app-cyan/80">
              ← {order.title}
            </Link>
            <h1 className="text-2xl font-bold text-text-primary mt-1">{t('orders.payments.title')}</h1>
          </div>
        </div>

        <div className="bg-app-card rounded-xl border border-white/10 p-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="text-text-secondary">
            {t('orders.payments.paidCount', { paid: paidCount, total: sorted.length })}
          </span>
          <span className="text-app-cyan font-medium">
            {totalPaid.toFixed(2)} € / {totalAll.toFixed(2)} €
          </span>
        </div>

        {sorted.length > 0 && (
          <div className="relative">
            <input
              type="text"
              list="payment-checklist-names"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('orders.payments.searchPlaceholder')}
              className="w-full px-4 py-2.5 bg-app-card border border-white/10 rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
            />
            <datalist id="payment-checklist-names">
              {sorted.map((r) => (
                <option key={r.id} value={r.userName} />
              ))}
            </datalist>
          </div>
        )}

        {sorted.length === 0 ? (
          <div className="bg-app-card rounded-xl border border-white/10 p-8 text-center text-text-muted">
            {t('orders.noResponsesYet')}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-app-card rounded-xl border border-white/10 p-8 text-center text-text-muted">
            {t('orders.payments.noMatch')}
          </div>
        ) : (
          <div className="bg-app-card rounded-xl border border-white/10 divide-y divide-white/5">
            {filtered.map((response) => {
              const price = getOrderResponseTotal(order.fields, response);
              return (
                <div key={response.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-text-primary font-medium truncate">{response.userName}</span>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <span className="text-text-secondary text-sm whitespace-nowrap">{price.toFixed(2)} €</span>
                    <input
                      type="checkbox"
                      checked={!!response.paid}
                      disabled={togglingId === response.id}
                      onChange={() => handleToggle(response)}
                      className="w-5 h-5 text-app-cyan focus:ring-app-cyan/50 rounded cursor-pointer disabled:opacity-50"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Container>
  );
}
