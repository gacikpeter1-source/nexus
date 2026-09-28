/**
 * Rink-diagram view of a hockey lineup — one "line" (lane) of skaters at a
 * time, swiped/tapped between, plus the starting goalie (always shown, same
 * on every line since goalies don't rotate by line). Three layers: the
 * club's own rink image (untouched, cropped to one half and rotated 90° in
 * pure CSS so the goal ends up on top), a flat jersey icon recolored
 * per-player from the club's logo (two solid-color masks — body + trim —
 * filled with the two dominant colors extracted from the logo image), and
 * the player's name/number plus the real club logo layered directly on the
 * jersey, no background box.
 *
 * An empty position is desaturated/dimmed directly on the rink. Tapping a
 * position still opens the same assign/search flow EventLineup already
 * uses (unchanged); this component only replaces how lanes/goalie are
 * displayed, not how they're edited. Only the FIRST goalie (the starter) is
 * shown here — backup goalies stay in EventLineup's separate goalie list,
 * since the rink only has room for the one currently in net.
 */

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useJerseyColors, contrastColor } from '../../hooks/useJerseyColors';
import JerseyIcon, { type RosterPlayer } from './JerseyIcon';

type LaneRecord = Record<string, string | null>;

const RINK_IMAGE = '/playgrounds/hockey-rink-realistic.png';
const RINK_IMAGE_W = 1024;
const RINK_IMAGE_H = 571;

// left%/top% = center anchor of each jersey icon on the rotated half-rink;
// kept within the measured ice surface, not the boards.
const POSITIONS: { col: string; labelKey: string; left: number; top: number; w: number }[] = [
  { col: 'dr', labelKey: 'lineup.columns.dr', left: 22, top: 37, w: 21 },
  { col: 'dl', labelKey: 'lineup.columns.dl', left: 78, top: 37, w: 21 },
  { col: 'wr', labelKey: 'lineup.columns.wr', left: 22, top: 67, w: 21 },
  { col: 'wl', labelKey: 'lineup.columns.wl', left: 78, top: 67, w: 21 },
  { col: 'c',  labelKey: 'lineup.columns.c',  left: 50, top: 84, w: 21 },
];
// The goalie stands right in the crease, close to the boards behind the net
// — that's the one spot on the rink where sitting near the boards is correct.
const GOALIE_POS = { left: 50, top: 15, w: 24 };

export default function HockeyLineupBoard({
  lanes, roster, canEdit, onOpenLane, onAddLane, onRemoveLane, clubLogoUrl, goalieId, onOpenGoalie,
}: {
  lanes: LaneRecord[];
  roster: RosterPlayer[];
  canEdit: boolean;
  onOpenLane: (laneIndex: number, col: string, colLabelKey: string) => void;
  onAddLane: () => void;
  onRemoveLane: (laneIndex: number) => void;
  clubLogoUrl?: string;
  goalieId: string | null;
  onOpenGoalie: () => void;
}) {
  const { t } = useLanguage();
  const [lineIndex, setLineIndex] = useState(0);
  const colors = useJerseyColors(clubLogoUrl);
  const dragStartX = useRef<number | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (lineIndex >= lanes.length) setLineIndex(Math.max(0, lanes.length - 1));
  }, [lanes.length, lineIndex]);

  if (lanes.length === 0) return null;
  const lane = lanes[lineIndex];
  const textColor = contrastColor(colors.primary);

  const goTo = (i: number) => {
    const n = lanes.length;
    setLineIndex(((i % n) + n) % n);
  };

  const startDrag = (x: number) => { dragStartX.current = x; dragging.current = true; };
  const endDrag = (x: number) => {
    if (!dragging.current || dragStartX.current == null) return;
    const dx = x - dragStartX.current;
    dragging.current = false;
    dragStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) goTo(lineIndex + 1); else goTo(lineIndex - 1);
  };
  const cancelDrag = () => { dragging.current = false; dragStartX.current = null; };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-text-primary">{t('lineup.lane', { n: lineIndex + 1 })} <span className="text-text-muted font-normal">· {lineIndex + 1}/{lanes.length}</span></span>
        {canEdit && lanes.length > 1 && (
          <button
            type="button"
            onClick={() => onRemoveLane(lineIndex)}
            className="text-[11px] text-text-muted hover:text-chart-pink"
          >
            {t('lineup.removeLane', { n: lineIndex + 1 })}
          </button>
        )}
      </div>

      <div
        className="relative w-full rounded-xl overflow-hidden select-none bg-app-primary"
        style={{ aspectRatio: `${RINK_IMAGE_H} / ${RINK_IMAGE_W / 2}`, touchAction: 'pan-y' }}
        onTouchStart={(e) => startDrag(e.touches[0].clientX)}
        onTouchEnd={(e) => endDrag(e.changedTouches[0].clientX)}
        onTouchCancel={cancelDrag}
        onMouseDown={(e) => startDrag(e.clientX)}
        onMouseUp={(e) => endDrag(e.clientX)}
        onMouseLeave={cancelDrag}
      >
        {/* Layer 1: the club's rink image, untouched — cropped to one half and
            rotated 90° via pure CSS so the goal ends up on top. */}
        <div
          className="absolute top-1/2 left-1/2"
          style={{
            height: '100%', aspectRatio: `${RINK_IMAGE_W / 2} / ${RINK_IMAGE_H}`,
            transform: 'translate(-50%, -50%) rotate(90deg)',
            backgroundImage: `url(${RINK_IMAGE})`, backgroundSize: '200% 100%',
            backgroundPosition: 'left center', backgroundRepeat: 'no-repeat',
          }}
        />

        <JerseyIcon
          left={GOALIE_POS.left} top={GOALIE_POS.top} w={GOALIE_POS.w}
          playerId={goalieId} roster={roster} canEdit={canEdit} onClick={onOpenGoalie}
          colors={colors} textColor={textColor} clubLogoUrl={clubLogoUrl}
        />
        {POSITIONS.map(pos => (
          <JerseyIcon
            key={pos.col}
            left={pos.left} top={pos.top} w={pos.w}
            playerId={lane[pos.col]} roster={roster} canEdit={canEdit}
            onClick={() => onOpenLane(lineIndex, pos.col, pos.labelKey)}
            colors={colors} textColor={textColor} clubLogoUrl={clubLogoUrl}
          />
        ))}
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => goTo(lineIndex - 1)}
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
              aria-label={t('lineup.lane', { n: i + 1 })}
              className="w-2 h-2 rounded-full"
              style={{ background: i === lineIndex ? '#00D4FF' : 'rgba(255,255,255,0.22)' }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => goTo(lineIndex + 1)}
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
