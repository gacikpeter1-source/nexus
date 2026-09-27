/**
 * Rink-diagram view of a hockey lineup's skater lanes — one "line" (lane) at
 * a time, swiped/tapped between, replacing the position label on the
 * background photo with each player's name + jersey number. An empty
 * position is desaturated/dimmed directly on the photo. Tapping a position
 * opens the same assign/search flow EventLineup already uses (unchanged);
 * this component only replaces how lanes are displayed, not how they're
 * edited. Goalies aren't part of this — they're shown separately above, same
 * as before, since they don't rotate by line.
 */

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';

type LaneRecord = Record<string, string | null>;
type RosterPlayer = { id: string; name: string; jerseyNumber?: number };

const POSITIONS: { col: string; labelKey: string; left: number; top: number; boxLeft: number; boxTop: number; boxW: number; boxH: number }[] = [
  { col: 'dr', labelKey: 'lineup.columns.dr', left: 19, top: 47, boxLeft: 4, boxTop: 4, boxW: 28, boxH: 50 },
  { col: 'dl', labelKey: 'lineup.columns.dl', left: 81, top: 47, boxLeft: 68, boxTop: 4, boxW: 28, boxH: 50 },
  { col: 'wr', labelKey: 'lineup.columns.wr', left: 15, top: 80, boxLeft: 0, boxTop: 54, boxW: 24, boxH: 44 },
  { col: 'c', labelKey: 'lineup.columns.c', left: 50, top: 86, boxLeft: 38, boxTop: 54, boxW: 24, boxH: 44 },
  { col: 'wl', labelKey: 'lineup.columns.wl', left: 85, top: 80, boxLeft: 76, boxTop: 54, boxW: 24, boxH: 44 },
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
  const dragX = useRef<number | null>(null);

  useEffect(() => {
    if (lineIndex >= lanes.length) setLineIndex(Math.max(0, lanes.length - 1));
  }, [lanes.length, lineIndex]);

  if (lanes.length === 0) return null;
  const lane = lanes[lineIndex];

  const goTo = (i: number) => setLineIndex(((i % lanes.length) + lanes.length) % lanes.length);

  const onPointerDown = (e: React.PointerEvent) => {
    dragX.current = e.clientX;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (dragX.current == null) return;
    const dx = e.clientX - dragX.current;
    dragX.current = null;
    if (Math.abs(dx) < 40) return;
    goTo(dx < 0 ? lineIndex + 1 : lineIndex - 1);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-text-primary">{t('lineup.lane', { n: lineIndex + 1 })}</span>
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
        style={{ aspectRatio: '1206 / 586', touchAction: 'pan-y', cursor: canEdit ? undefined : 'default' }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <img src="/lineup-positions.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />

        {POSITIONS.map(pos => {
          const playerId = lane[pos.col];
          const player = playerId ? roster.find(r => r.id === playerId) : null;
          const empty = !player;
          return (
            <div key={pos.col}>
              {empty && (
                <div
                  className="absolute rounded-xl"
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
                className="absolute -translate-x-1/2 min-w-[110px] text-center px-2.5 py-1 rounded text-[11px] font-extrabold whitespace-nowrap disabled:cursor-default"
                style={{
                  left: `${pos.left}%`, top: `${pos.top}%`,
                  background: empty ? 'rgba(50,54,74,0.85)' : 'rgba(10,12,24,0.88)',
                  color: empty ? '#6B7290' : '#FFFFFF',
                  border: empty ? 'none' : '1px solid rgba(255,255,255,0.15)',
                }}
              >
                {player ? `${player.name.split(' ')[0]} · #${player.jerseyNumber ?? '—'}` : t('lineup.openPosition')}
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
          className="w-8 h-8 rounded-full border border-white/15 bg-white/5 text-text-primary text-sm"
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
          className="w-8 h-8 rounded-full border border-white/15 bg-white/5 text-text-primary text-sm"
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
