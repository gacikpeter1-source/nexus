/**
 * Orders Page - List all orders
 * Role-based: Club owners see all, trainers/assistants see their team orders
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { getClubOrders, getUserOrdersWithStatus } from '../../services/firebase/orders';
import { getUserClubs } from '../../services/firebase/clubs';
import type { Order, OrderResponse } from '../../types';

export default function OrdersPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [orders, setOrders] = useState<Order[]>([]);
  const [userItems, setUserItems] = useState<Array<{ order: Order; response: OrderResponse | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClubId, setSelectedClubId] = useState<string>('');
  const [userClubs, setUserClubs] = useState<Array<{ id: string; name: string }>>([]);
  const [canCreateOrder, setCanCreateOrder] = useState(false);

  // Load user's clubs
  useEffect(() => {
    if (!user) return;

    const loadClubs = async () => {
      try {
        const clubs = await getUserClubs(user.id);
        setUserClubs(clubs.map(c => ({ id: c.id!, name: c.name })));
        
        if (clubs.length > 0 && !selectedClubId) {
          setSelectedClubId(clubs[0].id!);
        }

        // Check if user can create orders
        const hasPermission = clubs.some(club => 
          user.ownedClubIds?.includes(club.id!) || 
          user.role === 'trainer' || 
          user.role === 'assistant'
        );
        setCanCreateOrder(hasPermission);
      } catch (error) {
        console.error('Error loading clubs:', error);
      }
    };

    loadClubs();
  }, [user]);

  // Load orders when club is selected
  useEffect(() => {
    if (!user || !selectedClubId) return;

    const loadOrders = async () => {
      setLoading(true);
      try {
        if (user.role === 'clubOwner' || user.role === 'trainer' || user.role === 'assistant') {
          const fetchedOrders = await getClubOrders(selectedClubId, user.id, user.role);
          setOrders(fetchedOrders);
        } else {
          // Regular users: show active orders + orders they already responded to
          const fetchedItems = await getUserOrdersWithStatus(selectedClubId, user.id, user.teamIds || []);
          setUserItems(fetchedItems);
        }
      } catch (error) {
        console.error('Error loading orders:', error);
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, [user, selectedClubId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'closed':
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      case 'cancelled':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      default:
        return 'bg-app-blue/20 text-app-cyan border-app-cyan/30';
    }
  };

  const isExpired = (deadline: any) => {
    const deadlineDate = typeof deadline === 'string' ? new Date(deadline) : deadline.toDate();
    return new Date() > deadlineDate;
  };

  const formatDeadline = (deadline: any) => {
    const deadlineDate = typeof deadline === 'string' ? new Date(deadline) : deadline.toDate();
    return deadlineDate.toLocaleDateString();
  };

  if (!user) {
    return null;
  }

  const isRegularUser = user.role !== 'clubOwner' && user.role !== 'trainer' && user.role !== 'assistant';

  const getResponseBadge = (response: OrderResponse | null, deadline: any) => {
    const deadlineDate = typeof deadline === 'string' ? new Date(deadline) : deadline.toDate();
    const expired = new Date() > deadlineDate;
    if (response) {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium border bg-green-500/20 text-green-400 border-green-500/30 flex items-center gap-1">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          {t('orders.responded')}
        </span>
      );
    }
    if (!expired) {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium border bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
          {t('orders.pendingResponse')}
        </span>
      );
    }
    return null;
  };

  return (
    <Container>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">
              {t('orders.title')}
            </h1>
            <p className="text-text-secondary">
              {t('orders.subtitle')}
            </p>
          </div>

          {canCreateOrder && (
            <Link
              to="/orders/create"
              className="inline-flex items-center px-4 py-2 bg-gradient-primary text-white rounded-lg hover:shadow-button-hover transition-all"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('orders.createOrder')}
            </Link>
          )}
        </div>

        {/* Club Selector */}
        {userClubs.length > 1 && (
          <div className="bg-app-card rounded-xl border border-white/10 p-4">
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {t('orders.selectClub')}
            </label>
            <select
              value={selectedClubId}
              onChange={(e) => setSelectedClubId(e.target.value)}
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

        {/* Orders List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-app-cyan"></div>
          </div>
        ) : isRegularUser ? (
          /* ── Regular user view: orders with response status ── */
          userItems.length === 0 ? (
            <div className="bg-app-card rounded-xl border border-white/10 p-12 text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="text-xl font-semibold text-text-primary mb-2">{t('orders.noOrders')}</h3>
              <p className="text-text-muted">{t('orders.noOrdersDescription')}</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {userItems.map(({ order, response }) => (
                <Link
                  key={order.id}
                  to={`/orders/${order.id}`}
                  className="bg-app-card rounded-xl border border-white/10 p-6 hover:border-app-cyan/30 transition-all group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h3 className="text-lg font-bold text-text-primary group-hover:text-app-cyan transition-colors">
                          {order.title}
                        </h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(order.status)}`}>
                          {t(`orders.status.${order.status}`)}
                        </span>
                        {isExpired(order.deadline) && order.status === 'active' && (
                          <span className="px-2 py-1 rounded-full text-xs font-medium border bg-red-500/20 text-red-400 border-red-500/30">
                            {t('orders.expired')}
                          </span>
                        )}
                        {getResponseBadge(response, order.deadline)}
                      </div>

                      {order.description && (
                        <p className="text-text-muted text-sm mb-3 line-clamp-2">{order.description}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-4 text-sm text-text-muted">
                        <div className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span>{t('orders.deadline')}: {formatDeadline(order.deadline)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span>{order.creatorName}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <svg className="w-6 h-6 text-text-muted group-hover:text-app-cyan transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )
        ) : (
          /* ── Manager view: all orders ── */
          orders.length === 0 ? (
            <div className="bg-app-card rounded-xl border border-white/10 p-12 text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="text-xl font-semibold text-text-primary mb-2">{t('orders.noOrders')}</h3>
              <p className="text-text-muted mb-6">{t('orders.noOrdersDescription')}</p>
              {canCreateOrder && (
                <Link to="/orders/create" className="inline-flex items-center px-4 py-2 bg-gradient-primary text-white rounded-lg hover:shadow-button-hover transition-all">
                  {t('orders.createFirstOrder')}
                </Link>
              )}
            </div>
          ) : (
            <div className="grid gap-4">
              {orders.map((order) => (
                <Link
                  key={order.id}
                  to={`/orders/${order.id}`}
                  className="bg-app-card rounded-xl border border-white/10 p-6 hover:border-app-cyan/30 transition-all group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-text-primary group-hover:text-app-cyan transition-colors">
                          {order.title}
                        </h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(order.status)}`}>
                          {t(`orders.status.${order.status}`)}
                        </span>
                        {isExpired(order.deadline) && order.status === 'active' && (
                          <span className="px-2 py-1 rounded-full text-xs font-medium border bg-red-500/20 text-red-400 border-red-500/30">
                            {t('orders.expired')}
                          </span>
                        )}
                      </div>

                      {order.description && (
                        <p className="text-text-muted text-sm mb-3 line-clamp-2">{order.description}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-4 text-sm text-text-muted">
                        <div className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span>{t('orders.deadline')}: {formatDeadline(order.deadline)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          <span>{order.responseCount} {t('orders.responses')}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span>{order.creatorName}</span>
                        </div>
                        {order.targetAudience === 'team' && (
                          <div className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            <span className="text-app-cyan">{t('orders.teamOrder')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <svg className="w-6 h-6 text-text-muted group-hover:text-app-cyan transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )
        )}
      </div>
    </Container>
  );
}
