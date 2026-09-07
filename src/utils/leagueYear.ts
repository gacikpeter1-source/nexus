/**
 * League year ("season") boundaries — e.g. "2026/2027" — used to scope Stats
 * dashboards to one season instead of blending every attendance/game record
 * ever recorded together. A club's league year runs May 1 through April 30
 * the following year (summer conditioning in May kicks off the new season,
 * running through the ice season into spring) — this is a fixed, app-wide
 * convention, not a per-club setting.
 */

export const LEAGUE_YEAR_START_MONTH = 5; // May, 1-indexed

export interface LeagueYear {
  startYear: number;
  label: string;      // "2026/2027"
  startDate: string;  // "2026-05-01"
  endDate: string;    // "2027-04-30"
}

export function leagueYearFromStartYear(startYear: number, startMonth = LEAGUE_YEAR_START_MONTH): LeagueYear {
  const pad = (n: number) => String(n).padStart(2, '0');
  const endYear = startYear + 1;
  const endMonth = startMonth === 1 ? 12 : startMonth - 1;
  const endMonthYear = startMonth === 1 ? startYear : endYear;
  const lastDayOfEndMonth = new Date(endMonthYear, endMonth, 0).getDate(); // day 0 of next month = last day of this one
  return {
    startYear,
    label: `${startYear}/${endYear}`,
    startDate: `${startYear}-${pad(startMonth)}-01`,
    endDate: `${endMonthYear}-${pad(endMonth)}-${pad(lastDayOfEndMonth)}`,
  };
}

/** Which league year a given "YYYY-MM-DD" date string falls in. */
export function leagueYearFor(dateStr: string, startMonth = LEAGUE_YEAR_START_MONTH): LeagueYear {
  const [y, m] = dateStr.split('-').map(Number);
  const startYear = m >= startMonth ? y : y - 1;
  return leagueYearFromStartYear(startYear, startMonth);
}

/** The league year containing today (or the given date). */
export function currentLeagueYear(startMonth = LEAGUE_YEAR_START_MONTH, today: Date = new Date()): LeagueYear {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const startYear = m >= startMonth ? y : y - 1;
  return leagueYearFromStartYear(startYear, startMonth);
}

/** True if a "YYYY-MM-DD" date string falls within this league year (inclusive). */
export function isInLeagueYear(dateStr: string, year: LeagueYear): boolean {
  return dateStr >= year.startDate && dateStr <= year.endDate;
}
