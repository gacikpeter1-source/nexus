/**
 * Respond to Order Page
 * User form for submitting order responses
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { getOrder, getUserResponse, submitOrderResponse, uploadOrderFile } from '../../services/firebase/orders';
import type { Order, OrderResponse } from '../../types';

export default function RespondToOrder() {
  const { orderId } = useParams<{ orderId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [order, setOrder] = useState<Order | null>(null);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [files, setFiles] = useState<Record<string, File>>({});
  const [fileUploads, setFileUploads] = useState<Record<string, string>>({});
  const [existingResponse, setExistingResponse] = useState<OrderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // Load order and existing response
  useEffect(() => {
    if (!user || !orderId) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const clubId = user.clubIds?.[0];
        if (!clubId) {
          throw new Error('No club ID found');
        }

        const fetchedOrder = await getOrder(clubId, orderId);
        if (!fetchedOrder) {
          throw new Error('Order not found');
        }

        setOrder(fetchedOrder);

        // Check if user already responded
        const response = await getUserResponse(clubId, orderId, user.id);
        if (response) {
          setExistingResponse(response);
          setResponses(response.responses);
          setFileUploads(response.fileUploads || {});
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
  }, [user, orderId, navigate, t]);

  // Handle field change
  const handleFieldChange = (fieldId: string, value: any) => {
    setResponses((prev) => ({
      ...prev,
      [fieldId]: value,
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

  // Validate form
  const validateForm = (): boolean => {
    if (!order) return false;

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

    if (!user || !order || !orderId) return;

    if (!validateForm()) return;

    const clubId = user.clubIds?.[0];
    if (!clubId) return;

    setSubmitting(true);
    setUploadingFiles(true);

    try {
      // Upload files first
      const uploadedFiles = await uploadFiles(clubId);
      setUploadingFiles(false);

      // Submit response
      const responseData = {
        orderId,
        userId: user.id,
        userName: user.displayName,
        userEmail: user.email,
        responses,
        fileUploads: uploadedFiles,
      };

      await submitOrderResponse(clubId, orderId, responseData);
      
      // Navigate back to order detail
      navigate(`/orders/${orderId}`);
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

  return (
    <Container>
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
        {/* Back Button */}
        <button
          type="button"
          onClick={() => navigate(`/orders/${orderId}`)}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('common.back')}
        </button>

        {/* Header */}
        <div className="bg-app-card rounded-xl border border-white/10 p-6">
          <h1 className="text-2xl font-bold text-text-primary mb-2">
            {existingResponse ? t('orders.editYourResponse') : t('orders.respondToOrder')}
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

        {/* Form Fields */}
        <div className="bg-app-card rounded-xl border border-white/10 p-6 space-y-6">
          {order.fields.map((field) => (
            <div key={field.id}>
              <label className="block text-sm font-medium text-text-primary mb-2">
                {field.label}
                {field.required && <span className="text-red-400 ml-1">*</span>}
                <span className="text-xs text-text-muted ml-2">({t(`orders.fieldTypes.${field.type}`)})</span>
              </label>

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
                <input
                  type="text"
                  value={responses[field.id] || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Only allow numbers
                    if (value === '' || /^\d+$/.test(value)) {
                      handleFieldChange(field.id, value);
                    }
                  }}
                  required={field.required}
                  pattern="\d*"
                  inputMode="numeric"
                  className="w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-app-cyan/50"
                />
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
            </div>
          ))}
        </div>

        {/* Submit Button */}
        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate(`/orders/${orderId}`)}
            className="px-6 py-3 bg-app-secondary border border-white/10 text-white rounded-lg hover:bg-white/10 transition-all"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
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
      </form>
    </Container>
  );
}
