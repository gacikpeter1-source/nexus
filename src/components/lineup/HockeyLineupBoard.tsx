/**
 * Rink-diagram view of a hockey lineup's skater lanes — one "line" (lane) at
 * a time, swiped/tapped between, replacing the position label on the
 * background photo with each player's name + jersey number. An empty
 * position is desaturated/dimmed directly on the photo. Tapping a position
 * opens the same assign/search flow EventLineup already uses (unchanged);
 * this component only replaces how lanes are displayed, not how they're
 * edited. Goalies aren't part of this — they're shown separately above, same
 * as before, since they don't rotate by line.
 *
 * Label box coordinates below were measured directly against the photo
 * (public/lineup-positions.jpg, 1206x586) so the name pill fully covers the
 * original burned-in position text — not eyeballed.
 */

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';

type LaneRecord = Record<string, string | null>;
type RosterPlayer = { id: string; name: string; jerseyNumber?: number };

const POSITIONS: {
  col: string; labelKey: string;
  pillLeft: number; pillTop: number; pillW: number; pillH: number;
  boxLeft: number; boxTop: number; boxW: number; boxH: number;
}[] = [
  { col: 'c',  labelKey: 'lineup.columns.c',  pillLeft: 44.8, pillTop: 32.5, pillW: 10.1, pillH: 9.5, boxLeft: 38, boxTop: 4,  boxW: 26, boxH: 44 },
  { col: 'dr', labelKey: 'lineup.columns.dr', pillLeft: 10.9, pillTop: 43.4, pillW: 16.6, pillH: 9.3, boxLeft: 4,  boxTop: 4,  boxW: 28, boxH: 50 },
  { col: 'dl', labelKey: 'lineup.columns.dl', pillLeft: 72.4, pillTop: 43.4, pillW: 15.1, pillH: 9.3, boxLeft: 68, boxTop: 4,  boxW: 28, boxH: 50 },
  { col: 'wr', labelKey: 'lineup.columns.wr', pillLeft: 8.7,  pillTop: 75.8, pillW: 14.0, pillH: 9.3, boxLeft: 0,  boxTop: 54, boxW: 24, boxH: 44 },
  { col: 'wl', labelKey: 'lineup.columns.wl', pillLeft: 76.7, pillTop: 75.8, pillW: 12.5, pillH: 9.5, boxLeft: 76, boxTop: 54, boxW: 24, boxH: 44 },
];
// "c" (centre) sits on the ice above; its label box measured lower (~83%) —
// keep as its own entry since it doesn't share the top row's vertical band.
const CENTRE_PILL = { pillLeft: 44.8, pillTop: 81.4, pillW: 10.2, pillH: 9.5 };

export default function HockeyLineupBoard({
  lanes, roster, canEdit, onOpenLane, onAddLane, onRemoveLane,
}: {
  lanes: LaneRecord[];
  roster: RosterPlayer[];
  canEdit: boolean;
  onOpenLane: (laneIndex: number, col: string, colLabelKey: string) => void;
  onAddLane: () => void;
  onRemoveLane: (laneIndex: number) => void;
}) {
  const { t } = useLanguage();
  const [lineIndex, setLineIndex] = useState(0);
  const dragStartX = useRef<number | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (lineIndex >= lanes.length) setLineIndex(Math.max(0, lanes.length - 1));
  }, [lanes.length, lineIndex]);

  if (lanes.length === 0) return null;
  const lane = lanes[lineIndex];

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
        className="relative w-full rounded-xl overflow-hidden select-none"
        style={{ aspectRatio: '1206 / 586', touchAction: 'pan-y', containerType: 'inline-size' } as React.CSSProperties}
        onTouchStart={(e) => startDrag(e.touches[0].clientX)}
        onTouchEnd={(e) => endDrag(e.changedTouches[0].clientX)}
        onTouchCancel={cancelDrag}
        onMouseDown={(e) => startDrag(e.clientX)}
        onMouseUp={(e) => endDrag(e.clientX)}
        onMouseLeave={cancelDrag}
      >
        <img src="/lineup-positions.jpg" alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" draggable={false} />

        {POSITIONS.map(pos => {
          const playerId = lane[pos.col];
          const player = playerId ? roster.find(r => r.id === playerId) : null;
          const empty = !player;
          const pill = pos.col === 'c' ? { ...pos, ...CENTRE_PILL } : pos;
          return (
            <div key={pos.col}>
              {empty && (
                <div
                  className="absolute rounded-xl pointer-events-none"
                  style={{
                    left: `${pos.boxLeft}%`, top: `${pos.boxTop}%`, width: `${pos.boxW}%`, height: `${pos.boxH}%`,
                    backdropFilter: 'grayscale(1) brightness(0.55)', WebkitBackdropFilter: 'grayscale(1) brightness(0.55)',
                  }}
                />
              )}
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => onOpenLane(lineIndex, pos.col, pos.labelKey)}
                className="absolute flex flex-col items-center justify-center gap-0 rounded disabled:cursor-default overflow-hidden"
                style={{
                  left: `${pill.pillLeft}%`, top: `${pill.pillTop}%`, width: `${pill.pillW}%`, height: `${pill.pillH}%`,
                  background: empty ? '#32364a' : '#0a0c18',
                  color: empty ? '#6B7290' : '#FFFFFF',
                  padding: '1px 2px',
                }}
              >
                {player ? (
                  <>
                    <span
                      className="font-extrabold leading-none whitespace-nowrap overflow-hidden text-ellipsis max-w-full"
                      style={{ fontSize: 'clamp(6px, 2.3cqw, 10px)' }}
                    >
                      {player.name.split(' ').pop()}
                    </span>
                    <span
                      className="font-extrabold leading-none text-app-cyan whitespace-nowrap"
                      style={{ fontSize: 'clamp(6px, 2.3cqw, 10px)' }}
                    >
                      #{player.jerseyNumber ?? '—'}
                    </span>
                  </>
                ) : (
                  <span className="font-extrabold leading-none" style={{ fontSize: 'clamp(10px, 3.5cqw, 16px)' }}>+</span>
                )}
              </button>
            </div>
          );
        })}
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
