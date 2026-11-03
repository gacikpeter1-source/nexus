/**
 * Picker shown when a calendar day (month grid cell, or a week-view day
 * column) has more than one event on it. The month/week grids only have
 * room for tiny, cramped per-event chips — easy to tap the wrong one on a
 * phone — so for 2+ events the day itself becomes the tap target and opens
 * this list instead, where each row is a full-size, clearly labeled target.
 *
 * A plain centered dialog, not a bottom sheet anchored to the keyboard or
 * anything viewport-relative — there's no text input here, so none of the
 * iOS-keyboard-occlusion handling EventLineup's search sheet needed applies.
 */

import { Link } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { getEventColorClass, getEventBadgeClasses, getEventMutedOverlayClass } from '../../utils/eventColors';
import type { Event as CalendarEvent } from '../../types';

interface DayEventsModalProps {
  date: Date;
  events: CalendarEvent[];
  onClose: () => void;
}

export default function DayEventsModal({ date, events, onClose }: DayEventsModalProps) {
  const { t } = useLanguage();

  const sorted = [...events].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-app-card rounded-2xl border border-white/10 shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between gap-3 p-4 border-b border-white/10 flex-shrink-0">
            <div>
              <h3 className="text-base font-bold text-text-primary">{t('calendar.dayEvents.title')}</h3>
              <p className="text-xs text-text-muted">{date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="text-text-muted hover:text-text-primary flex-shrink-0 p-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="overflow-y-auto p-3 space-y-2">
            {sorted.map((event, i) => (
              <Link
                key={`${event.id}-${event.date}-${i}`}
                to={`/calendar/events/${event.id}${event.isRecurring ? `?date=${event.date}` : ''}`}
                onClick={onClose}
                className={`flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-app-secondary hover:border-app-cyan/40 transition-colors ${getEventMutedOverlayClass(event)}`}
              >
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${getEventColorClass(event)}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text-primary truncate">{event.title}</span>
                  <span className="flex items-center gap-2 text-xs text-text-muted">
                    {event.startTime && <span>{event.startTime}</span>}
                    {event.isRecurring && (
                      <span className="flex items-center gap-1 text-app-cyan">
                        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        {t('calendar.repeats', 'Repeats')}
                      </span>
                    )}
                  </span>
                </span>
                <span className={`flex-shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-full whitespace-nowrap ${getEventBadgeClasses(event)}`}>
                  {t(`calendar.eventTypes.${event.type}`, event.type)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
