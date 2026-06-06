/**
 * Order Detail Page
 * Shows order details, responses, and allows CSV export
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import {
  getOrder,
  getUserResponse,
  exportOrderToCSV,
  downloadCSV,
  updateOrder,
  deleteOrder,
  deleteOrderResponse,
  subscribeToOrderResponses,
  isOrderExpired,
  getNonResponders,
} from '../../services/firebase/orders';
import { getTeam } from '../../services/firebase/teams';
import type { Order, OrderResponse } from '../../types';

export default function OrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [order, setOrder] = useState<Order | null>(null);
  const [responses, setResponses] = useState<OrderResponse[]>([]);
  const [userResponse, setUserResponse] = useState<OrderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCreator, setIsCreator] = useState(false);
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; displayName: string }>>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDeleteResponseModal, setShowDeleteResponseModal] = useState(false);

  // Load order
  useEffect(() => {
    if (!user || !orderId) return;

    const loadOrderData = async () => {
      setLoading(true);
      try {
        // Find the club ID (we need to get it from user's clubs)
        const clubId = user.clubIds?.[0]; // Simplified - in production, detect from order
        if (!clubId) {
          throw new Error('No club ID found');
        }

        const fetchedOrder = await getOrder(clubId, orderId);
        if (!fetchedOrder) {
          throw new Error('Order not found');
        }

        setOrder(fetchedOrder);
        setIsCreator(fetchedOrder.createdBy === user.id);

        // Load responses (if creator)
        if (fetchedOrder.createdBy === user.id) {
          // Subscribe to real-time updates
          const unsubscribe = subscribeToOrderResponses(clubId, orderId, (updatedResponses) => {
            setResponses(updatedResponses);
          });

          // Load team members for non-responders list
          if (fetchedOrder.teamId) {
            const team = await getTeam(clubId, fetchedOrder.teamId);
            if (team) {
              const memberUserIds = team.membersData
                ? Object.keys(team.membersData)
                : (team.members || []);
              const membersList = memberUserIds.map((userId: string) => ({
                id: userId,
                displayName: 'Team Member'
              }));
              setTeamMembers(membersList);
            }
          }

          return () => unsubscribe();
        } else {
          // Load user's own response
          const response = await getUserResponse(clubId, orderId, user.id);
          setUserResponse(response);
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
  }, [user, orderId, navigate, t]);

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

  // Close order
  const handleCloseOrder = async () => {
    if (!order || !user) return;

    const clubId = user.clubIds?.[0];
    if (!clubId) return;

    try {
      await updateOrder(clubId, orderId!, { status: 'closed' });
      setOrder({ ...order, status: 'closed' });
    } catch (error) {
      console.error('Error closing order:', error);
      alert(t('orders.closeError'));
    }
  };

  // Delete the user's own response (after deadline)
  const handleDeleteMyResponse = async () => {
    if (!userResponse?.id || !user) return;
    const clubId = user.clubIds?.[0];
    if (!clubId) return;

    try {
      await deleteOrderResponse(clubId, orderId!, userResponse.id);
      setUserResponse(null);
      setShowDeleteResponseModal(false);
      navigate('/orders');
    } catch (error) {
      console.error('Error deleting response:', error);
      alert(t('orders.deleteResponseError'));
    }
  };

  // Delete order
  const handleDeleteOrder = async () => {
    if (!order || !user) return;

    const clubId = user.clubIds?.[0];
    if (!clubId) return;

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
  const canRespond = !isCreator && order.status === 'active' && !expired && !userResponse;
  const canEdit = !isCreator && order.status === 'active' && !expired && userResponse;
  const canDeleteResponse = !isCreator && expired && !!userResponse;
  const nonResponders = isCreator && teamMembers.length > 0 ? getNonResponders(teamMembers, responses) : [];

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
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {canRespond && (
                <Link
                  to={`/orders/${orderId}/respond`}
                  className="px-4 py-2 bg-gradient-primary text-white rounded-lg hover:shadow-button-hover transition-all"
                >
                  {t('orders.respond')}
                </Link>
              )}
              
              {canEdit && (
                <Link
                  to={`/orders/${orderId}/respond`}
                  className="px-4 py-2 bg-app-blue/20 border border-app-cyan/30 text-app-cyan rounded-lg hover:bg-app-blue/30 transition-all"
                >
                  {t('orders.editResponse')}
                </Link>
              )}

              {canDeleteResponse && (
                <button
                  onClick={() => setShowDeleteResponseModal(true)}
                  className="px-4 py-2 bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/30 transition-all"
                >
                  {t('orders.deleteMyResponse')}
                </button>
              )}

              {isCreator && (
                <>
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

        {/* Order Fields */}
        <div className="bg-app-card rounded-xl border border-white/10 p-6">
          <h2 className="text-xl font-bold text-text-primary mb-4">
            {t('orders.requiredFields')}
          </h2>
          <div className="grid gap-3">
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
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* User's Response (for non-creators) */}
        {!isCreator && userResponse && (
          <div className="bg-app-card rounded-xl border border-white/10 p-6">
            <h2 className="text-xl font-bold text-text-primary mb-4">
              {t('orders.yourResponse')}
            </h2>
            <div className="space-y-3">
              {order.fields.map((field) => (
                <div key={field.id} className="p-3 bg-app-secondary rounded-lg">
                  <p className="text-sm font-medium text-text-secondary mb-1">{field.label}</p>
                  <p className="text-text-primary">
                    {userResponse.responses[field.id] !== undefined && userResponse.responses[field.id] !== null
                      ? String(userResponse.responses[field.id])
                      : '-'}
                  </p>
                </div>
              ))}
              <p className="text-xs text-text-muted mt-4">
                {t('orders.submittedAt')}: {new Date(
                  typeof userResponse.submittedAt === 'string'
                    ? userResponse.submittedAt
                    : userResponse.submittedAt.toDate()
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
        )}

        {/* Responses (for creators) */}
        {isCreator && (
          <div className="bg-app-card rounded-xl border border-white/10 p-6">
            <h2 className="text-xl font-bold text-text-primary mb-4">
              {t('orders.allResponses')} ({responses.length})
            </h2>
            
            {responses.length === 0 ? (
              <div className="text-center py-8 text-text-muted">
                <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p>{t('orders.noResponsesYet')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-3 px-2 text-text-secondary font-medium">
                        {t('orders.userName')}
                      </th>
                      {order.fields.map((field) => (
                        <th key={field.id} className="text-left py-3 px-2 text-text-secondary font-medium">
                          {field.label}
                        </th>
                      ))}
                      <th className="text-left py-3 px-2 text-text-secondary font-medium">
                        {t('orders.submittedAt')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {responses.map((response) => (
                      <tr key={response.id} className="border-b border-white/10 hover:bg-white/5">
                        <td className="py-3 px-2 text-text-primary font-medium">
                          {response.userName}
                        </td>
                        {order.fields.map((field) => (
                          <td key={field.id} className="py-3 px-2 text-text-secondary">
                            {response.responses[field.id] !== undefined && response.responses[field.id] !== null
                              ? String(response.responses[field.id])
                              : '-'}
                          </td>
                        ))}
                        <td className="py-3 px-2 text-text-muted text-xs">
                          {new Date(
                            typeof response.submittedAt === 'string'
                              ? response.submittedAt
                              : response.submittedAt.toDate()
                          ).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

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
        {showDeleteResponseModal && (
          <>
            <div className="fixed inset-0 bg-black/70 z-50" onClick={() => setShowDeleteResponseModal(false)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-app-card rounded-xl border border-white/10 p-6 max-w-md w-full">
                <h3 className="text-xl font-bold text-text-primary mb-3">
                  {t('orders.confirmDeleteResponse')}
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
                    onClick={() => setShowDeleteResponseModal(false)}
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
