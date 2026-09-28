/**
 * Court-diagram view of a volleyball lineup — one rotation at a time,
 * swiped/tapped between (same "lanes" concept as hockey's lines, just
 * called rotations here). Team's own six positions are drawn on the near
 * (left) half of the court photo, standard textbook layout:
 *
 *   net →      [4][3][2]   front row (near net)
 *              [5][6][1]   back row
 *
 * Same jersey treatment as every other sport's board: two solid-color
 * masks (body + trim) auto-colored from the club logo, the club logo +
 * name/number directly on the fabric, no background box.
 */

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useJerseyColors, contrastColor } from '../../hooks/useJerseyColors';
import JerseyIcon, { type RosterPlayer } from './JerseyIcon';

type LaneRecord = Record<string, string | null>;

const COURT_IMAGE = '/playgrounds/volleyball-court-ai.png';
const COURT_ASPECT = '1536 / 1024';

// left%/top% measured against the actual court photo — near-side half only
// (x 9.8-50%, the net is the vertical line at x=50%); front row sits closer
// to the net, back row farther from it.
const POSITIONS: { col: string; labelKey: string; left: number; top: number }[] = [
  { col: 'p4', labelKey: 'lineup.columns.p4', left: 40.15, top: 29.9 }, // front row
  { col: 'p3', labelKey: 'lineup.columns.p3', left: 40.15, top: 48.2 },
  { col: 'p2', labelKey: 'lineup.columns.p2', left: 40.15, top: 66.5 },
  { col: 'p5', labelKey: 'lineup.columns.p5', left: 19.9, top: 29.9 }, // back row
  { col: 'p6', labelKey: 'lineup.columns.p6', left: 19.9, top: 48.2 },
  { col: 'p1', labelKey: 'lineup.columns.p1', left: 19.9, top: 66.5 },
];
const JERSEY_W = 12;

export default function VolleyballLineupBoard({
  lanes, roster, canEdit, onOpenLane, onAddLane, onRemoveLane, clubLogoUrl,
}: {
  lanes: LaneRecord[];
  roster: RosterPlayer[];
  canEdit: boolean;
  onOpenLane: (laneIndex: number, col: string, colLabelKey: string) => void;
  onAddLane: () => void;
  onRemoveLane: (laneIndex: number) => void;
  clubLogoUrl?: string;
}) {
  const { t } = useLanguage();
  const [laneIndex, setLaneIndex] = useState(0);
  const colors = useJerseyColors(clubLogoUrl);
  const dragStartX = useRef<number | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (laneIndex >= lanes.length) setLaneIndex(Math.max(0, lanes.length - 1));
  }, [lanes.length, laneIndex]);

  if (lanes.length === 0) return null;
  const lane = lanes[laneIndex];
  const textColor = contrastColor(colors.primary);

  const goTo = (i: number) => {
    const n = lanes.length;
    setLaneIndex(((i % n) + n) % n);
  };

  const startDrag = (x: number) => { dragStartX.current = x; dragging.current = true; };
  const endDrag = (x: number) => {
    if (!dragging.current || dragStartX.current == null) return;
    const dx = x - dragStartX.current;
    dragging.current = false;
    dragStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) goTo(laneIndex + 1); else goTo(laneIndex - 1);
  };
  const cancelDrag = () => { dragging.current = false; dragStartX.current = null; };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-text-primary">{t('lineup.rotation', { n: laneIndex + 1 })} <span className="text-text-muted font-normal">· {laneIndex + 1}/{lanes.length}</span></span>
        {canEdit && lanes.length > 1 && (
          <button
            type="button"
            onClick={() => onRemoveLane(laneIndex)}
            className="text-[11px] text-text-muted hover:text-chart-pink"
          >
            {t('lineup.removeLane', { n: laneIndex + 1 })}
          </button>
        )}
      </div>

      <div
        className="relative w-full rounded-xl overflow-hidden select-none bg-app-primary"
        style={{ aspectRatio: COURT_ASPECT, touchAction: 'pan-y' }}
        onTouchStart={(e) => startDrag(e.touches[0].clientX)}
        onTouchEnd={(e) => endDrag(e.changedTouches[0].clientX)}
        onTouchCancel={cancelDrag}
        onMouseDown={(e) => startDrag(e.clientX)}
        onMouseUp={(e) => endDrag(e.clientX)}
        onMouseLeave={cancelDrag}
      >
        <img src={COURT_IMAGE} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" draggable={false} />

        {POSITIONS.map(pos => (
          <JerseyIcon
            key={pos.col}
            left={pos.left} top={pos.top} w={JERSEY_W}
            playerId={lane[pos.col]} roster={roster} canEdit={canEdit}
            onClick={() => onOpenLane(laneIndex, pos.col, pos.labelKey)}
            colors={colors} textColor={textColor} clubLogoUrl={clubLogoUrl}
          />
        ))}
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => goTo(laneIndex - 1)}
          aria-label={t('common.back')}
          className="w-9 h-9 rounded-full border border-white/15 bg-white/5 text-text-primary text-lg leading-none"
        >
          ‹
        </button>
        <div className="flex gap-1.5">
          {lanes.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={t('lineup.rotation', { n: i + 1 })}
              className="w-2 h-2 rounded-full"
              style={{ background: i === laneIndex ? '#00D4FF' : 'rgba(255,255,255,0.22)' }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => goTo(laneIndex + 1)}
          aria-label={t('common.next')}
          className="w-9 h-9 rounded-full border border-white/15 bg-white/5 text-text-primary text-lg leading-none"
        >
          ›
        </button>
      </div>

      {canEdit && (
        <button
          type="button"
          onClick={onAddLane}
          className="w-full text-xs font-semibold uppercase tracking-wide text-text-muted border border-dashed border-white/15 rounded-lg py-2 hover:border-app-cyan hover:text-app-cyan transition-colors"
        >
          {t('lineup.addLane')}
        </button>
      )}
    </div>
  );
}
