/**
 * Read-only "typical week" visualization of the rink schedule: one row per
 * day + hall, hours running left-to-right across a shared axis, entries
 * drawn as colored blocks positioned/sized by their real start/end time.
 * Clicking a block opens it in the entry editor (via onEntryClick).
 *
 * Since entries can recur, this shows which weekday(s) each entry occurs on
 * in a representative week — not a literal calendar of any specific week.
 */

import type { RinkHall, RinkScheduleEntry } from '../../types';
import { timeToHours, pctInRange, weekdaysFor, colorFor } from '../../utils/rinkScheduleTime';

type DraftEntry = Omit<RinkScheduleEntry, 'teamId' | 'eventId'>;

const DAY_START = 5;
const DAY_END = 24;
const HOURS = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);

// Monday-first display order, JS getDay() values underneath (0 = Sunday)
const DAY_ROWS: { dow: number; label: string }[] = [
  { dow: 1, label: 'Monday' },
  { dow: 2, label: 'Tuesday' },
  { dow: 3, label: 'Wednesday' },
  { dow: 4, label: 'Thursday' },
  { dow: 5, label: 'Friday' },
  { dow: 6, label: 'Saturday' },
  { dow: 0, label: 'Sunday' },
];

function pct(h: number): number {
  return pctInRange(h, DAY_START, DAY_END);
}

export default function RinkScheduleGrid({
  halls, entries, onEntryClick,
}: {
  halls: RinkHall[];
  entries: DraftEntry[];
  onEntryClick: (entry: DraftEntry) => void;
}) {
  if (halls.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-[1180px]"
        style={{ gridTemplateColumns: `160px repeat(${HOURS.length}, minmax(46px, 1fr))` }}
      >
        <div className="bg-app-card px-3 py-2 text-[11px] font-bold text-text-secondary border-b border-white/10">
          Day · Hall
        </div>
        {HOURS.map(h => (
          <div key={h} className="bg-app-card py-2 text-center text-[10px] font-semibold text-text-muted border-b border-white/10">
            {String(h).padStart(2, '0')}:00
          </div>
        ))}

        {DAY_ROWS.map(day => (
          <div key={day.dow} className="contents">
            <div className="col-span-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-app-cyan bg-app-cyan/5 border-t border-white/10">
              {day.label}
            </div>
            {halls.map(hall => {
              const hallEntries = entries.filter(
                e => e.hallId === hall.id && weekdaysFor(e).includes(day.dow)
              );
              return (
                <div key={hall.id} className="contents">
                  <div className="px-3 py-2 text-xs font-semibold text-text-primary bg-white/5 border-b border-r border-white/10 flex items-center">
                    {hall.name}
                  </div>
                  <div
                    className="relative border-b border-white/10 bg-app-card"
                    style={{
                      gridColumn: `span ${HOURS.length}`,
                      height: 44,
                      backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent calc(100%/${HOURS.length - 1} - 1px), rgba(255,255,255,.06) calc(100%/${HOURS.length - 1}))`,
                    }}
                  >
                    {hallEntries.map(entry => {
                      const start = timeToHours(entry.startTime);
                      const end = timeToHours(entry.endTime);
                      const left = pct(start);
                      const width = Math.max(pct(end) - pct(start), 4);
                      const color = colorFor(entry.name);
                      return (
                        <button
                          key={entry.id}
                          onClick={() => onEntryClick(entry)}
                          title={`${entry.name} · ${entry.startTime}–${entry.endTime}${entry.room ? ' · ' + entry.room : ' · TBA'}`}
                          className="absolute top-1 bottom-1 rounded-md px-1.5 text-left overflow-hidden hover:brightness-110 transition-all"
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            background: `${color}26`,
                            border: `1px solid ${color}80`,
                            color,
                          }}
                        >
                          <div className="text-[10px] font-bold leading-tight truncate">{entry.name}</div>
                          <div className="text-[9px] leading-tight opacity-80 truncate">{entry.room || 'TBA'}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
