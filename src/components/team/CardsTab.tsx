/**
 * CardsTab — Ice hockey player cards for a team.
 *
 * Every team member sees every card. A card's position/handedness/jersey
 * number/photo can be edited by the athlete themselves (or their parent, if
 * the athlete is a child), or by team staff (trainer/assistant/club owner).
 */

import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTeamAthletes } from '../../hooks/useTeamAthletes';
import { getTeamPlayerCards, upsertPlayerCard } from '../../services/firebase/playerCards';
import { uploadFile, deleteFile, validateFile } from '../../services/firebase/storage';
import type { User, PlayerCard, PlayerPosition, PlayerHandedness } from '../../types';

interface Props {
  clubId: string;
  teamId: string;
  members: User[];
  canManage: boolean;
  currentUserId: string;
}

const POSITIONS: PlayerPosition[] = ['goalie', 'defence', 'forward'];
const HANDS: PlayerHandedness[] = ['left', 'right'];

export default function CardsTab({ clubId, teamId, members, canManage, currentUserId }: Props) {
  const { t } = useLanguage();
  const { athletes, myAthleteIds, loading: athletesLoading } = useTeamAthletes(members, teamId, currentUserId);

  const [cards, setCards] = useState<Record<string, PlayerCard>>({});
  const [loadingCards, setLoadingCards] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    loadCards();
  }, [clubId, teamId]);

  const loadCards = async () => {
    setLoadingCards(true);
    try {
      const list = await getTeamPlayerCards(clubId, teamId);
      const map: Record<string, PlayerCard> = {};
      list.forEach(c => { map[c.athleteId] = c; });
      setCards(map);
    } catch (err) {
      console.error('CardsTab: load failed', err);
    } finally {
      setLoadingCards(false);
    }
  };

  const canEdit = (athleteId: string) => canManage || myAthleteIds.includes(athleteId);

  const isLoading = athletesLoading || loadingCards;

  return (
    <div className="space-y-3 sm:space-y-4">
      <h2 className="text-sm sm:text-base md:text-lg font-bold text-text-primary">{t('cards.title')}</h2>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-app-cyan" />
        </div>
      ) : athletes.length === 0 ? (
        <p className="text-center py-10 text-xs text-text-secondary">{t('cards.noAthletes')}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-3">
          {athletes.map(athlete => (
            <PlayerCardTile
              key={athlete.userId}
              athleteId={athlete.userId}
              athleteName={athlete.userName}
              fallbackPhoto={athlete.photoURL}
              card={cards[athlete.userId]}
              editable={canEdit(athlete.userId)}
              onEdit={() => setEditingId(athlete.userId)}
            />
          ))}
        </div>
      )}

      {editingId && (
        <EditCardDialog
          clubId={clubId}
          teamId={teamId}
          athleteId={editingId}
          athleteName={athletes.find(a => a.userId === editingId)?.userName || ''}
          card={cards[editingId]}
          updatedBy={currentUserId}
          onClose={() => setEditingId(null)}
          onSaved={(card) => {
            setCards(prev => ({ ...prev, [editingId]: card }));
            setEditingId(null);
          }}
        />
      )}
    </div>
  );
}

// ── card tile ────────────────────────────────────────────────────────────
function PlayerCardTile({
  athleteId, athleteName, fallbackPhoto, card, editable, onEdit,
}: {
  athleteId: string;
  athleteName: string;
  fallbackPhoto?: string;
  card?: PlayerCard;
  editable: boolean;
  onEdit: () => void;
}) {
  const { t } = useLanguage();
  const photo = card?.photoURL || fallbackPhoto;

  return (
    <button
      onClick={editable ? onEdit : undefined}
      disabled={!editable}
      className={`relative bg-app-secondary border border-white/10 rounded-xl p-3 flex flex-col items-center text-center transition-all ${
        editable ? 'hover:border-app-cyan/50 cursor-pointer' : 'cursor-default'
      }`}
    >
      {card?.jerseyNumber !== undefined && card.jerseyNumber !== null && (
        <span className="absolute top-1.5 right-1.5 min-w-[20px] h-5 px-1 flex items-center justify-center rounded-full bg-app-blue text-white text-[10px] font-bold">
          {card.jerseyNumber}
        </span>
      )}

      {photo ? (
        <img src={photo} alt={athleteName} className="w-14 h-14 rounded-full object-cover mb-2" />
      ) : (
        <div className="w-14 h-14 rounded-full bg-gradient-primary flex items-center justify-center text-lg font-bold text-white mb-2">
          {athleteId.length > 0 ? athleteName.charAt(0).toUpperCase() : '?'}
        </div>
      )}

      <span className="text-xs font-semibold text-text-primary truncate w-full">{athleteName}</span>

      {card?.position ? (
        <span className="text-[10px] text-app-cyan font-medium mt-0.5">
          {t(`cards.positions.${card.position}`)}
          {card.handedness && <span className="text-text-muted"> · {t(`cards.handedness.${card.handedness}`)}</span>}
        </span>
      ) : (
        <span className="text-[10px] text-text-muted mt-0.5">{t('cards.noPosition')}</span>
      )}

      {editable && (
        <span className="text-[9px] text-text-muted mt-1.5">{t('cards.tapToEdit')}</span>
      )}
    </button>
  );
}

// ── edit dialog ──────────────────────────────────────────────────────────
function EditCardDialog({
  clubId, teamId, athleteId, athleteName, card, updatedBy, onClose, onSaved,
}: {
  clubId: string;
  teamId: string;
  athleteId: string;
  athleteName: string;
  card?: PlayerCard;
  updatedBy: string;
  onClose: () => void;
  onSaved: (card: PlayerCard) => void;
}) {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [position, setPosition] = useState<PlayerPosition | ''>(card?.position || '');
  const [handedness, setHandedness] = useState<PlayerHandedness | ''>(card?.handedness || '');
  const [jerseyNumber, setJerseyNumber] = useState<string>(card?.jerseyNumber !== undefined && card?.jerseyNumber !== null ? String(card.jerseyNumber) : '');
  const [photoURL, setPhotoURL] = useState<string | undefined>(card?.photoURL);
  const [photoStoragePath, setPhotoStoragePath] = useState<string | undefined>(card?.photoStoragePath);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const validation = validateFile(file, { maxSizeMB: 5, allowedTypes: ['image/jpeg', 'image/png', 'image/webp'] });
    if (!validation.valid) {
      setError(validation.error || t('cards.errors.uploadFailed'));
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const { downloadUrl, storagePath } = await uploadFile(file, { category: 'team', clubId, teamId });
      const oldPath = photoStoragePath;
      setPhotoURL(downloadUrl);
      setPhotoStoragePath(storagePath);
      if (oldPath) {
        deleteFile(oldPath).catch(() => {});
      }
    } catch (err) {
      console.error('CardsTab: photo upload failed', err);
      setError(t('cards.errors.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const parsedJersey = jerseyNumber.trim() === '' ? null : Number(jerseyNumber);
      await upsertPlayerCard(clubId, teamId, athleteId, {
        position: position || null,
        handedness: handedness || null,
        jerseyNumber: parsedJersey !== null && !Number.isNaN(parsedJersey) ? parsedJersey : null,
        photoURL: photoURL ?? null,
        photoStoragePath: photoStoragePath ?? null,
      }, updatedBy);

      onSaved({
        id: `${teamId}_${athleteId}`,
        clubId, teamId, athleteId,
        position: position || undefined,
        handedness: handedness || undefined,
        jerseyNumber: parsedJersey !== null && !Number.isNaN(parsedJersey) ? parsedJersey : undefined,
        photoURL,
        photoStoragePath,
        updatedAt: new Date().toISOString(),
        updatedBy,
      });
    } catch (err) {
      console.error('CardsTab: save failed', err);
      setError(t('cards.errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-app-card w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl p-5 max-h-[90vh] overflow-y-auto">
          <h2 className="text-base font-bold text-text-primary mb-1">{t('cards.editTitle')}</h2>
          <p className="text-xs text-text-secondary mb-4">{athleteName}</p>

          {/* Photo */}
          <div className="flex justify-center mb-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-white/10 hover:border-app-cyan/50 transition-colors disabled:opacity-50"
            >
              {photoURL ? (
                <img src={photoURL} alt={athleteName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-primary flex items-center justify-center text-2xl font-bold text-white">
                  {athleteName.charAt(0).toUpperCase()}
                </div>
              )}
              {uploading && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                </div>
              )}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
          </div>
          <p className="text-center text-[10px] text-text-muted -mt-2 mb-4">{t('cards.changePhoto')}</p>

          <div className="space-y-3">
            {/* Position */}
            <div>
              <label className="block text-[10px] font-semibold text-text-secondary uppercase mb-1">{t('cards.position')}</label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value as PlayerPosition | '')}
                className="w-full px-3 py-2 bg-app-secondary border border-white/10 rounded-lg text-sm text-text-primary focus:outline-none focus:border-app-blue"
              >
                <option value="">{t('cards.selectPosition')}</option>
                {POSITIONS.map(p => (
                  <option key={p} value={p}>{t(`cards.positions.${p}`)}</option>
                ))}
              </select>
            </div>

            {/* Handedness */}
            <div>
              <label className="block text-[10px] font-semibold text-text-secondary uppercase mb-1">{t('cards.handednessLabel')}</label>
              <select
                value={handedness}
                onChange={(e) => setHandedness(e.target.value as PlayerHandedness | '')}
                className="w-full px-3 py-2 bg-app-secondary border border-white/10 rounded-lg text-sm text-text-primary focus:outline-none focus:border-app-blue"
              >
                <option value="">{t('cards.selectHandedness')}</option>
                {HANDS.map(h => (
                  <option key={h} value={h}>{t(`cards.handedness.${h}`)}</option>
                ))}
              </select>
            </div>

            {/* Jersey number */}
            <div>
              <label className="block text-[10px] font-semibold text-text-secondary uppercase mb-1">{t('cards.jerseyNumber')}</label>
              <input
                type="number"
                min={0}
                max={99}
                value={jerseyNumber}
                onChange={(e) => setJerseyNumber(e.target.value)}
                placeholder="0-99"
                className="w-full px-3 py-2 bg-app-secondary border border-white/10 rounded-lg text-sm text-text-primary focus:outline-none focus:border-app-blue"
              />
            </div>
          </div>

          {error && <p className="text-xs text-chart-pink mt-3">{error}</p>}

          <div className="flex gap-2 mt-5">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || uploading}
              className="flex-1 px-4 py-2.5 bg-gradient-primary rounded-xl text-sm font-semibold text-white shadow-button hover:shadow-button-hover transition-all disabled:opacity-50"
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
