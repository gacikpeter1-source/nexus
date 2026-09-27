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
  { col: 'dr', labelKey: 'lineup.columns.dr', pillLeft: 9.9,  pillTop: 42.4, pillW: 18.6, pillH: 11.3, boxLeft: 4,  boxTop: 4,  boxW: 28, boxH: 50 },
  { col: 'dl', labelKey: 'lineup.columns.dl', pillLeft: 71.4, pillTop: 42.4, pillW: 17.1, pillH: 11.3, boxLeft: 68, boxTop: 4,  boxW: 28, boxH: 50 },
  { col: 'wr', labelKey: 'lineup.columns.wr', pillLeft: 7.7,  pillTop: 74.8, pillW: 16.0, pillH: 11.3, boxLeft: 0,  boxTop: 54, boxW: 24, boxH: 44 },
  { col: 'c',  labelKey: 'lineup.columns.c',  pillLeft: 43.8, pillTop: 80.4, pillW: 12.2, pillH: 11.5, boxLeft: 38, boxTop: 54, boxW: 24, boxH: 44 },
  { col: 'wl', labelKey: 'lineup.columns.wl', pillLeft: 75.7, pillTop: 74.8, pillW: 14.5, pillH: 11.5, boxLeft: 76, boxTop: 54, boxW: 24, boxH: 44 },
];

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
        style={{ aspectRatio: '1206 / 586', touchAction: 'pan-y' }}
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
                className="absolute rounded disabled:cursor-default p-0 border-0"
                style={{ left: `${pos.pillLeft}%`, top: `${pos.pillTop}%`, width: `${pos.pillW}%`, height: `${pos.pillH}%` }}
              >
                {/* Solid background, sized only by the button's own box — never affected by the text layer's sizing. */}
                <div
                  className="absolute inset-0 rounded"
                  style={{ background: empty ? '#32364a' : '#0a0c18' }}
                />
                {/* Text layer, clipped to the same box so it can never spill past the background. */}
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
                  style={{ padding: '1px 3px', color: empty ? '#6B7290' : '#FFFFFF' }}
                >
                  {player ? (
                    <>
                      <span
                        className="font-extrabold whitespace-nowrap overflow-hidden text-ellipsis max-w-full block"
                        style={{ fontSize: 'clamp(7px, 1.8vw, 11px)', lineHeight: 1.15 }}
                      >
                        {player.name.split(' ').pop()}
                      </span>
                      <span
                        className="font-extrabold text-app-cyan whitespace-nowrap block"
                        style={{ fontSize: 'clamp(7px, 1.8vw, 11px)', lineHeight: 1.15 }}
                      >
                        #{player.jerseyNumber ?? '—'}
                      </span>
                    </>
                  ) : (
                    <span className="font-extrabold" style={{ fontSize: 'clamp(11px, 3vw, 16px)', lineHeight: 1 }}>+</span>
                  )}
                </div>
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
