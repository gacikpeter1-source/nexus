/**
 * Excel template download + import parsing for the Rink Schedule tool.
 * Position-based columns (not header-text matching), same convention as
 * tournamentExcel.ts, so it works regardless of the app's current language:
 *
 *   A Hall | B Event name | C Date | D Start | E End | F Room |
 *   G Recurring (Yes/No) | H Frequency (daily/weekly/monthly) | I Interval |
 *   J Days of week (Mon,Wed,Fri) | K End date | L End after N occurrences
 */

import type { RinkHall, RinkScheduleEntry } from '../types';

type DraftEntry = Omit<RinkScheduleEntry, 'teamId' | 'eventId'>;

const DAY_CODES: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export async function downloadRinkScheduleTemplate(): Promise<void> {
  const XLSX = await import('xlsx');

  const header = [
    'Hall', 'Event name', 'Date', 'Start', 'End', 'Room',
    'Recurring (Yes/No)', 'Frequency (daily/weekly/monthly)', 'Interval',
    'Days of week (Mon,Wed,Fri)', 'End date', 'End after N occurrences',
  ];
  const exampleDate = new Date();
  exampleDate.setDate(exampleDate.getDate() + ((1 - exampleDate.getDay() + 7) % 7 || 7)); // next Monday
  const exampleRows = [
    ['Hall A', 'HP3', exampleDate.toISOString().slice(0, 10), '15:30', '16:30', 'Room 3-4', 'Yes', 'weekly', '2', 'Mon', '', '20'],
    ['Hall B', 'Skating — Aneta', exampleDate.toISOString().slice(0, 10), '17:00', '17:45', '', 'No', '', '', '', '', ''],
  ];

  const sheet = XLSX.utils.aoa_to_sheet([header, ...exampleRows]);
  sheet['!cols'] = header.map(() => ({ wch: 22 }));

  const instructions = [
    'Each row is one schedule entry. Hall must match a hall you\'ve already created in the app — a hall name that doesn\'t exist yet will be added automatically.',
    'Date, End date: format YYYY-MM-DD. Start, End: 24-hour format HH:MM.',
    'Room can be left blank if not decided yet — it will show as "TBA" until you fill it in.',
    'Recurring: "Yes" or "No". If "No", leave Frequency/Interval/Days of week/End date/End after N occurrences blank.',
    'Frequency: daily, weekly, or monthly. Interval: every N days/weeks/months (leave blank for 1).',
    'Days of week (only for weekly): comma-separated 3-letter codes, e.g. Mon,Wed,Fri.',
    'End date and End after N occurrences are optional — leave both blank for a schedule that repeats indefinitely. If both are filled in, End date is used.',
    'Uploading this file replaces the schedule currently shown on the calendar and the TV board.',
  ];
  const instructionsSheet = XLSX.utils.aoa_to_sheet(instructions.map(line => [line]));
  instructionsSheet['!cols'] = [{ wch: 100 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Schedule');
  XLSX.utils.book_append_sheet(wb, instructionsSheet, 'Instructions');
  XLSX.writeFile(wb, 'rink_schedule_template.xlsx');
}

export interface RinkScheduleImportResult {
  entries: DraftEntry[];
  newHalls: RinkHall[];
  errors: string[];
}

export async function parseRinkScheduleWorkbook(
  file: File,
  existingHalls: RinkHall[]
): Promise<RinkScheduleImportResult> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets['Schedule'] || wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { entries: [], newHalls: [], errors: ['No sheet found in this file.'] };

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  const dataRows = rows.slice(1).filter(r => r.some(c => String(c ?? '').trim() !== ''));

  const hallByName = new Map(existingHalls.map(h => [h.name.trim().toLowerCase(), h]));
  const newHalls: RinkHall[] = [];
  const entries: DraftEntry[] = [];
  const errors: string[] = [];

  dataRows.forEach((r, i) => {
    const rowNum = i + 2; // 1-indexed, +1 for the header row
    const [hallName, name, date, startTime, endTime, room, recurringRaw, freqRaw, intervalRaw, daysRaw, endDateRaw, countRaw] =
      r.map(c => String(c ?? '').trim());

    if (!hallName) { errors.push(`Row ${rowNum}: missing hall.`); return; }
    if (!name) { errors.push(`Row ${rowNum}: missing event name.`); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { errors.push(`Row ${rowNum}: date must be YYYY-MM-DD.`); return; }
    if (!/^\d{1,2}:\d{2}$/.test(startTime) || !/^\d{1,2}:\d{2}$/.test(endTime)) {
      errors.push(`Row ${rowNum}: start/end time must be HH:MM.`); return;
    }
    if (endTime <= startTime) { errors.push(`Row ${rowNum}: end time must be after start time.`); return; }

    let hall = hallByName.get(hallName.toLowerCase());
    if (!hall) {
      hall = { id: crypto.randomUUID(), name: hallName };
      hallByName.set(hallName.toLowerCase(), hall);
      newHalls.push(hall);
    }

    const isRecurring = /^y(es)?$/i.test(recurringRaw);
    let recurrenceRule: RinkScheduleEntry['recurrenceRule'];
    if (isRecurring) {
      const frequency = (['daily', 'weekly', 'monthly'].includes(freqRaw.toLowerCase()) ? freqRaw.toLowerCase() : 'weekly') as 'daily' | 'weekly' | 'monthly';
      const interval = Math.max(1, parseInt(intervalRaw, 10) || 1);
      let daysOfWeek: number[] | undefined;
      if (frequency === 'weekly') {
        daysOfWeek = daysRaw
          .split(',')
          .map(d => d.trim())
          .filter(Boolean)
          .map(d => DAY_CODES[d.slice(0, 3).replace(/^(\w)/, c => c.toUpperCase())])
          .filter(d => d !== undefined);
        if (daysOfWeek.length === 0) {
          errors.push(`Row ${rowNum}: weekly recurrence needs at least one day (e.g. Mon,Wed,Fri) — used the entry's own date's weekday instead.`);
          daysOfWeek = [new Date(date + 'T00:00:00').getDay()];
        }
      }
      recurrenceRule = {
        frequency,
        interval,
        ...(daysOfWeek ? { daysOfWeek } : {}),
        ...(endDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(endDateRaw) ? { endDate: endDateRaw } : {}),
        ...(!endDateRaw && countRaw && parseInt(countRaw, 10) > 0 ? { count: parseInt(countRaw, 10) } : {}),
      };
    }

    entries.push({
      id: crypto.randomUUID(),
      hallId: hall.id,
      name,
      date,
      startTime,
      endTime,
      room,
      isRecurring,
      ...(recurrenceRule ? { recurrenceRule } : {}),
    });
  });

  return { entries, newHalls, errors };
}

