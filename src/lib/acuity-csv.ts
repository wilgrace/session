import { parse } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AcuityRow {
  startTime: string;       // raw: "March 8, 2026 07:45"
  endTime: string;         // raw: "March 8, 2026 08:45"
  timezone: string;        // "Europe/London"
  firstName: string;
  lastName: string;
  email: string;
  type: string;            // raw: "60 mins - Sauna and Cold Plunge (Concession)"
  normalizedType: string;  // "(Concession)" suffix stripped
  appointmentPrice: string;
  paid: string;
  amountPaidOnline: string;
  certificateCode: string;
  notes: string;
  appointmentId: string;
  startTimeUTC: string;    // ISO UTC
  endTimeUTC: string;      // ISO UTC
  slotKey: string;         // "{normalizedType}|{startTimeUTC}"
}

export interface AcuitySlot {
  slotKey: string;
  normalizedType: string;
  startTimeUTC: string;    // ISO UTC
  endTimeUTC: string;      // ISO UTC
  timezone: string;
  bookingCount: number;
}

export interface ImportWarning {
  type: 'no_email' | 'parse_error';
  message: string;
  rowIndex: number;
}

export interface ParseResult {
  rows: AcuityRow[];
  slots: AcuitySlot[];
  warnings: ImportWarning[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const REQUIRED_HEADERS = [
  'Start Time',
  'End Time',
  'Timezone',
  'First Name',
  'Last Name',
  'Email',
  'Type',
  'Appointment Price',
  'Amount Paid Online',
  'Appointment ID',
];

export function validateHeaders(headers: string[]): string | null {
  const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h));
  if (missing.length > 0) {
    return `Missing required columns: ${missing.join(', ')}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Strips "(Concession)" and similar variant suffixes from appointment type names */
export function normalizeTypeName(type: string): string {
  return type
    .replace(/\s*\(concession\)\s*/gi, '')
    .replace(/\s*\(member\)\s*/gi, '')
    .trim();
}

/**
 * Parses an Acuity date string ("March 8, 2026 07:45") in the given IANA timezone
 * and returns a UTC Date.
 */
export function parseAcuityDate(dateStr: string, timezone: string): Date {
  // date-fns parse treats the result as a local (browser/node) time;
  // we then use fromZonedTime to reinterpret it as the given timezone.
  const naive = parse(dateStr.trim(), 'MMMM d, yyyy HH:mm', new Date());
  return fromZonedTime(naive, timezone);
}

/**
 * Parse a papaparse-produced array of objects into AcuityRows.
 * Each object has keys matching the CSV header names.
 */
export function parseAcuityRows(
  rawRows: Record<string, string>[],
): ParseResult {
  const rows: AcuityRow[] = [];
  const warnings: ImportWarning[] = [];
  const slotMap = new Map<string, AcuitySlot>();

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];

    const email = (raw['Email'] ?? '').trim().toLowerCase();
    if (!email) {
      warnings.push({
        type: 'no_email',
        message: `Row ${i + 2}: no email address — skipped`,
        rowIndex: i,
      });
      continue;
    }

    const timezone = (raw['Timezone'] ?? 'Europe/London').trim();
    const rawStart = (raw['Start Time'] ?? '').trim();
    const rawEnd = (raw['End Time'] ?? '').trim();
    const type = (raw['Type'] ?? '').trim();
    const normalizedType = normalizeTypeName(type);

    let startUTC: Date;
    let endUTC: Date;
    try {
      startUTC = parseAcuityDate(rawStart, timezone);
      endUTC = parseAcuityDate(rawEnd, timezone);
    } catch {
      warnings.push({
        type: 'parse_error',
        message: `Row ${i + 2}: could not parse date "${rawStart}" — skipped`,
        rowIndex: i,
      });
      continue;
    }

    const startTimeUTC = startUTC.toISOString();
    const endTimeUTC = endUTC.toISOString();
    const slotKey = `${normalizedType}|${startTimeUTC}`;

    const row: AcuityRow = {
      startTime: rawStart,
      endTime: rawEnd,
      timezone,
      firstName: (raw['First Name'] ?? '').trim(),
      lastName: (raw['Last Name'] ?? '').trim(),
      email,
      type,
      normalizedType,
      appointmentPrice: (raw['Appointment Price'] ?? '').trim(),
      paid: (raw['Paid?'] ?? '').trim(),
      amountPaidOnline: (raw['Amount Paid Online'] ?? '').trim(),
      certificateCode: (raw['Certificate Code'] ?? '').trim(),
      notes: (raw['Notes'] ?? '').trim(),
      appointmentId: (raw['Appointment ID'] ?? '').trim(),
      startTimeUTC,
      endTimeUTC,
      slotKey,
    };

    rows.push(row);

    // Build/update slot summary
    const existing = slotMap.get(slotKey);
    if (existing) {
      existing.bookingCount++;
    } else {
      slotMap.set(slotKey, {
        slotKey,
        normalizedType,
        startTimeUTC,
        endTimeUTC,
        timezone,
        bookingCount: 1,
      });
    }
  }

  return {
    rows,
    slots: Array.from(slotMap.values()).sort((a, b) =>
      a.startTimeUTC.localeCompare(b.startTimeUTC),
    ),
    warnings,
  };
}
