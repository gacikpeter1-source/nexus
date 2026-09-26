/**
 * Public, unauthenticated TV board for a club's rink schedule — meant to run
 * on a screen at the rink entrance/bar, or be opened from the QR code shown
 * there. No login, no sidebar: this renders its own full-screen page.
 *
 * Per hall: a sliding ~3h timeline centered on the current time (event names
 * only, wrapped) plus an "up next" list underneath (full details — time,
 * name, room) that keeps itself current as sessions start/finish.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { useLanguage } from '../../contexts/LanguageContext';
import { getRinkSchedule } from '../../services/firebase/rinkSchedule';
import { getShareableOrigin } from '../../config/siteOrigin';
import { timeToHours, pctInRange, isActiveOn, colorFor } from '../../utils/rinkScheduleTime';
import type { RinkHall, RinkSchedule, RinkScheduleEntry } from '../../types';

const WINDOW_HOURS = 3;
const SCHEDULE_REFRESH_MS = 5 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function RinkBoardPublic() {
  const { clubId } = useParams<{ clubId: string }>();
  const { t } = useLanguage();
  const [schedule, setSchedule] = useState<RinkSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const qrRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!clubId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const s = await getRinkSchedule(clubId);
        if (!cancelled) setSchedule(s);
      } catch (err) {
        console.error('RinkBoardPublic: load failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const refresh = setInterval(load, SCHEDULE_REFRESH_MS);
    return () => { cancelled = true; clearInterval(refresh); };
  }, [clubId]);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!qrRef.current || !clubId) return;
    const url = `${getShareableOrigin()}/rink-board/${clubId}`;
    QRCode.toCanvas(qrRef.current, url, {
      width: 84,
      margin: 1,
      color: { dark: '#FFFFFF', light: '#0A0E27' },
    }, () => {});
  }, [clubId]);

  const todayStr = localDateStr(now);
  const todayDow = now.getDay();
  const nowTimeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const nowHours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const rangeStart = nowHours - WINDOW_HOURS / 2;
  const rangeEnd = nowHours + WINDOW_HOURS / 2;

  const entriesToday = useMemo(() => {
    if (!schedule) return [];
    return schedule.entries.filter(e => isActiveOn(e, todayStr, todayDow));
  }, [schedule, todayStr, todayDow]);

  if (loading) {
    return (
      <div className="min-h-screen bg-app-primary flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-app-cyan" />
      </div>
    );
  }

  if (!schedule || schedule.halls.length === 0) {
    return (
      <div className="min-h-screen bg-app-primary flex items-center justify-center px-6">
        <p className="text-text-muted text-center">{t('rinkSchedule.boardNotAvailable')}</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-app-primary flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-2.5 border-b border-white/10 bg-app-secondary flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl flex-shrink-0">🏒</span>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold text-text-primary truncate leading-tight">{schedule.clubName}</h1>
            {schedule.clubAddress && (
              <p className="text-[10px] text-text-muted truncate leading-tight">{schedule.clubAddress}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-lg sm:text-xl font-mono font-bold text-app-cyan tabular-nums">
            {pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}
          </span>
          <canvas ref={qrRef} className="rounded bg-app-primary w-[42px] h-[42px] sm:w-[52px] sm:h-[52px]" />
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-3 p-3 overflow-y-auto md:overflow-hidden min-h-0">
        {schedule.halls.map(hall => (
          <HallColumn
            key={hall.id}
            hall={hall}
            entries={entriesToday.filter(e => e.hallId === hall.id)}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            nowHours={nowHours}
            nowTimeStr={nowTimeStr}
          />
        ))}
      </div>
    </div>
  );
}

function HallColumn({
  hall, entries, rangeStart, rangeEnd, nowHours, nowTimeStr,
}: {
  hall: RinkHall;
  entries: RinkScheduleEntry[];
  rangeStart: number;
  rangeEnd: number;
  nowHours: number;
  nowTimeStr: string;
}) {
  const { t } = useLanguage();

  const visible = entries
    .map(e => {
      const start = timeToHours(e.startTime);
      const end = timeToHours(e.endTime);
      if (end <= rangeStart || start >= rangeEnd) return null;
      const left = pctInRange(Math.max(start, rangeStart), rangeStart, rangeEnd);
      const width = pctInRange(Math.min(end, rangeEnd), rangeStart, rangeEnd) - left;
      return { entry: e, left, width };
    })
    .filter((x): x is { entry: RinkScheduleEntry; left: number; width: number } => x !== null);

  const upNext = entries
    .filter(e => e.endTime > nowTimeStr)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, 5);

  const hourTicks: number[] = [];
  for (let h = Math.ceil(rangeStart); h <= Math.floor(rangeEnd); h++) hourTicks.push(h);
  const nowPct = pctInRange(nowHours, rangeStart, rangeEnd);

  return (
    <div className="flex-1 min-w-0 bg-app-card rounded-xl border border-white/10 flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-white/10 flex-shrink-0">
        <h2 className="text-sm font-bold text-text-primary truncate">{hall.name}</h2>
      </div>

      {/* Sliding timeline */}
      <div className="relative h-20 mx-3 mt-2 flex-shrink-0 overflow-hidden">
        {hourTicks.map(h => (
          <div
            key={h}
            className="absolute top-0 bottom-0 border-l border-white/10 transition-[left] duration-1000 ease-linear"
            style={{ left: `${pctInRange(h, rangeStart, rangeEnd)}%` }}
          >
            <span className="absolute -top-0.5 left-1 text-[9px] text-text-muted">{pad(h % 24)}:00</span>
          </div>
        ))}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-app-cyan z-10 transition-[left] duration-1000 ease-linear"
          style={{ left: `${nowPct}%` }}
        />
        {visible.map(({ entry, left, width }) => {
          const color = colorFor(entry.name);
          return (
            <div
              key={entry.id}
              className="absolute top-4 bottom-1 rounded-md px-1.5 py-1 overflow-hidden transition-[left,width] duration-1000 ease-linear"
              style={{
                left: `${left}%`,
                width: `${Math.max(width, 2)}%`,
                background: `${color}26`,
                border: `1px solid ${color}80`,
              }}
            >
              <div className="text-[10px] font-bold leading-tight break-words" style={{ color }}>{entry.name}</div>
            </div>
          );
        })}
      </div>

      {/* Up next */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 pt-2 space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{t('rinkSchedule.upNext')}</p>
        {upNext.length === 0 ? (
          <p className="text-xs text-text-muted">{t('rinkSchedule.noSessionsToday')}</p>
        ) : (
          upNext.map(entry => (
            <div key={entry.id} className="flex items-center justify-between gap-2 px-2 py-1.5 bg-white/5 rounded-lg">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-text-primary truncate">{entry.name}</p>
                <p className="text-[10px] text-text-muted">{entry.startTime}–{entry.endTime}</p>
              </div>
              <span className="flex-shrink-0 text-[10px] font-semibold text-app-cyan bg-app-cyan/10 px-2 py-0.5 rounded">
                {entry.room || t('rinkSchedule.roomTba')}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
