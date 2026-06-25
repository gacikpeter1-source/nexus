import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  getTeamDocuments,
  uploadTeamDocument,
  deleteTeamDocument,
  DOCS_TOTAL_LIMIT_BYTES,
} from '../../services/firebase/documents';
import type { TeamDocument } from '../../types/documents';

interface Props {
  clubId: string;
  teamId: string;
  canManage: boolean; // trainer / assistant of this team OR club owner
  currentUserId: string;
  currentUserName: string;
}

function fileIcon(mimeType: string): string {
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📑';
  return '📎';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function DocumentsTab({ clubId, teamId, canManage, currentUserId, currentUserName }: Props) {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [docs, setDocs] = useState<TeamDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, [clubId, teamId]);

  const load = async () => {
    setLoading(true);
    try {
      setDocs(await getTeamDocuments(clubId, teamId));
    } catch (err) {
      console.error('DocumentsTab: load failed', err);
    } finally {
      setLoading(false);
    }
  };

  const totalUsed = docs.reduce((sum, d) => sum + d.fileSize, 0);
  const usedPct = Math.min((totalUsed / DOCS_TOTAL_LIMIT_BYTES) * 100, 100);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setError(null);
    setUploading(true);
    setUploadProgress(0);
    try {
      const newDoc = await uploadTeamDocument(
        clubId, teamId, file,
        currentUserId, currentUserName,
        totalUsed,
        pct => setUploadProgress(Math.round(pct))
      );
      setDocs(prev => [newDoc, ...prev]);
    } catch (err: any) {
      if (err.message === 'FILE_TOO_LARGE') setError(t('documents.fileTooLarge'));
      else if (err.message === 'STORAGE_FULL') setError(t('documents.storageFull'));
      else setError(t('documents.uploadFailed'));
      console.error('DocumentsTab: upload failed', err);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = async (doc: TeamDocument) => {
    if (!doc.id) return;
    setDeletingId(doc.id);
    setConfirmDeleteId(null);
    try {
      await deleteTeamDocument(clubId, doc.id, doc.storagePath);
      setDocs(prev => prev.filter(d => d.id !== doc.id));
    } catch (err) {
      setError(t('documents.deleteFailed'));
      console.error('DocumentsTab: delete failed', err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm sm:text-base font-bold text-text-primary">{t('documents.title')}</h2>
        {canManage && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || totalUsed >= DOCS_TOTAL_LIMIT_BYTES}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] sm:text-xs bg-app-blue/20 text-app-cyan border border-app-cyan/20 rounded-lg hover:bg-app-blue/40 transition-colors font-medium disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {uploading ? t('documents.uploading') : t('documents.upload')}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          accept="*/*"
        />
      </div>

      {/* Storage bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[9px] text-text-muted">
          <span>{t('documents.storageUsed')}: {formatBytes(totalUsed)}</span>
          <span>{t('documents.storageLimit')}</span>
        </div>
        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${usedPct >= 90 ? 'bg-chart-pink' : usedPct >= 70 ? 'bg-chart-yellow' : 'bg-app-cyan'}`}
            style={{ width: `${usedPct}%` }}
          />
        </div>
      </div>

      {/* Upload progress */}
      {uploading && (
        <div className="space-y-1">
          <div className="flex justify-between text-[9px] text-text-muted">
            <span>{t('documents.uploading')}</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-app-cyan rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-2 bg-chart-pink/10 border border-chart-pink/30 rounded-lg text-xs text-chart-pink">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-text-muted hover:text-text-primary">✕</button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-app-cyan" />
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-10 space-y-1">
          <div className="text-2xl">📂</div>
          <p className="text-xs text-text-secondary">{t('documents.noDocuments')}</p>
          {canManage && <p className="text-[10px] text-text-muted">{t('documents.noDocumentsDesc')}</p>}
        </div>
      ) : (
        <div className="space-y-1">
          {docs.map(d => (
            <div key={d.id} className="flex items-center gap-2 p-2 sm:p-2.5 bg-app-secondary border border-white/10 rounded-lg">
              {/* Icon */}
              <span className="text-lg flex-shrink-0 leading-none">{fileIcon(d.fileType)}</span>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-text-primary truncate">{d.name}</div>
                <div className="text-[10px] text-text-muted">
                  {formatBytes(d.fileSize)} · {d.uploadedByName} · {formatDate(d.createdAt)}
                </div>
              </div>

              {/* Open/Download */}
              <a
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 p-1.5 rounded-lg bg-app-card hover:bg-white/10 transition-colors"
                title={t('documents.open')}
              >
                <svg className="w-3.5 h-3.5 text-app-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>

              {/* Delete — managers only */}
              {canManage && (
                confirmDeleteId === d.id ? (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleDelete(d)}
                      disabled={deletingId === d.id}
                      className="px-2 py-0.5 text-[9px] font-semibold rounded bg-chart-pink/20 text-chart-pink border border-chart-pink/30 hover:bg-chart-pink/30 transition-colors disabled:opacity-50"
                    >
                      {deletingId === d.id ? '…' : t('documents.confirmYes')}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2 py-0.5 text-[9px] font-semibold rounded bg-white/5 text-text-muted border border-white/10 hover:bg-white/10 transition-colors"
                    >
                      {t('documents.confirmNo')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(d.id!)}
                    disabled={deletingId === d.id}
                    className="flex-shrink-0 p-1.5 rounded-lg bg-app-card hover:bg-chart-pink/10 text-text-muted hover:text-chart-pink transition-colors disabled:opacity-50"
                    title={t('documents.delete')}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
