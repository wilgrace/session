import { format } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

export const SAUNA_TIMEZONE = 'Europe/London';

export function localToUTC(date: Date, timezone: string): Date {
  // Treat the date's wallclock representation as local time in `timezone` and convert to UTC
  return fromZonedTime(date, timezone);
}

export function utcToLocal(date: Date, timezone: string): Date {
  return toZonedTime(date, timezone);
}

export function formatLocalTime(date: Date, timezone: string): string {
  const localDate = utcToLocal(date, timezone);
  return format(localDate, 'HH:mm');
}

export function formatLocalDate(date: Date, timezone: string): string {
  const localDate = utcToLocal(date, timezone);
  return format(localDate, 'yyyy-MM-dd');
} 