/**
 * Compact Week View Calendar Component
 * Mobile-optimized: All 7 days visible in narrow columns, no horizontal scroll
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { Event as CalendarEvent } from '../../types';

interface CompactWeekViewProps {
  events: CalendarEvent[];
  selectedDate: Date;
  onDateSelect?: (date: Date) => void;
  weeksToShow?: number;
}

export default function CompactWeekView({ 
  events, 
  selectedDate,
  onDateSelect,
  weeksToShow = 4
}: CompactWeekViewProps) {
  // Day abbreviations
  const dayAbbreviations = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Generate multiple weeks
  const weeks = useMemo(() => {
    const weeksArray = [];
    const startDate = new Date(selectedDate);
    
    // Start from Monday of current week
    const dayOfWeek = startDate.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // If Sunday, go back 6 days, else go to Monday
    startDate.setDate(startDate.getDate() + diff);
    
    for (let weekIndex = 0; weekIndex < weeksToShow; weekIndex++) {
      const weekDays = [];
      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const day = new Date(startDate);
        day.setDate(startDate.getDate() + (weekIndex * 7) + dayIndex);
        weekDays.push(day);
      }
      weeksArray.push(weekDays);
    }
    return weeksArray;
  }, [selectedDate, weeksToShow]);

  // Get events for specific day
  const getEventsForDay = (day: Date): CalendarEvent[] => {
    const dateStr = formatDate(day);
    return events.filter(event => event.date === dateStr);
  };

  // Format date in local timezone (YYYY-MM-DD) without UTC conversion
  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Check if date is selected
  const isSelected = (day: Date): boolean => {
    return formatDate(day) === formatDate(selectedDate);
  };

  // Check if date is today
  const isToday = (day: Date): boolean => {
    return formatDate(day) === formatDate(new Date());
  };

  // Get week number
  const getWeekNumber = (date: Date): number => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  // Event type colors (matching design system)
  const getEventColor = (type?: string): string => {
    const colors: Record<string, string> = {
      training: 'bg-chart-purple',
      match: 'bg-chart-pink',
      meeting: 'bg-chart-blue',
      game: 'bg-chart-pink',
      practice: 'bg-chart-purple',
      other: 'bg-chart-cyan',
    };
    return colors[type || 'other'] || 'bg-chart-purple';
  };

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6 -mx-1 sm:mx-0">
      {/* Weeks Container */}
      {weeks.map((weekDays, weekIndex) => (
        <div key={weekIndex} className="bg-app-primary rounded-lg sm:rounded-xl p-1.5 sm:p-2 md:p-3">
          {/* Week Number Indicator - Optional */}
          <div className="text-center text-text-muted text-[10px] sm:text-xs mb-1.5 sm:mb-2 md:mb-3 font-medium">
            Week {getWeekNumber(weekDays[0])}
          </div>

          {/* Week Grid - 7 Equal Columns */}
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1 md:gap-1.5 lg:gap-2">
            {weekDays.map((day, dayIndex) => {
              const dayEvents = getEventsForDay(day);
              const selected = isSelected(day);
              const today = isToday(day);

              return (
                <div
                  key={dayIndex}
                  onClick={() => onDateSelect?.(day)}
                  className={`
                    bg-[#1a2248] rounded-md sm:rounded-lg overflow-hidden cursor-pointer transition-all border
                    ${selected ? 'border-2 border-yellow-500 shadow-lg' : 'border-transparent'}
                    ${today && !selected ? 'border-2 border-cyan-400' : ''}
                    ${!selected && !today ? 'border-white/10' : ''}
                    hover:border-app-blue/50
                  `}
                >
                  {/* Day Header */}
                  <div className="text-center py-0.5 sm:py-1 md:py-1.5 border-b border-white/5 bg-[#141b3d]">
                    <div className="text-text-muted text-[8px] sm:text-[9px] md:text-[10px] font-bold uppercase leading-tight">
                      {dayAbbreviations[dayIndex]}
                    </div>
                    <div className={`text-xs sm:text-sm md:text-base lg:text-lg font-bold mt-0.5 ${
                      selected ? 'text-yellow-500' : today ? 'text-cyan-400' : 'text-text-primary'
                    }`}>
                      {day.getDate()}
                    </div>
                  </div>

                  {/* Events Container */}
                  <div className="p-0.5 sm:p-1 md:p-1.5 space-y-0.5 sm:space-y-1 min-h-[60px] sm:min-h-[80px] md:min-h-[100px] lg:min-h-[120px]">
                    {dayEvents.length > 0 ? (
                      dayEvents.slice(0, 3).map((event) => {
                        const eventTime = event.startTime || '09:00';
                        
                        return (
                          <Link
                            key={event.id}
                            to={`/calendar/events/${event.id}`}
                            className={`
                              ${getEventColor(event.type)}
                              rounded p-0.5 sm:p-1 md:p-1.5 text-center block
                              hover:opacity-90 transition-all
                              shadow-sm sm:shadow-md
                            `}
                            title={event.title}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="text-white text-[9px] sm:text-[10px] md:text-[11px] font-bold leading-tight">
                              {eventTime}
                            </div>
                          </Link>
                        );
                      })
                    ) : (
                      <div className="flex items-center justify-center h-full pt-2 sm:pt-4 md:pt-6">
                        <span className="text-text-muted text-[10px] sm:text-xs opacity-30">-</span>
                      </div>
                    )}

                    {/* Show "+more" if more than 3 events */}
                    {dayEvents.length > 3 && (
                      <div className="text-center py-0.5 sm:py-1 bg-app-blue/30 rounded mt-0.5 sm:mt-1">
                        <span className="text-app-cyan text-[8px] sm:text-[9px] md:text-[10px] font-bold">
                          +{dayEvents.length - 3}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

