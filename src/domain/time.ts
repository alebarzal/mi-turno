import type { Segment, ShiftType } from './types';

export const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
export const WEEKDAYS_ES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
/** Letras de la cartelera, lunes primero. */
export const WEEKDAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Normaliza "8", "8:0", "08.00", "08:00h" → "08:00". Devuelve null si no es una hora válida. */
export function normalizeTime(raw: string): string | null {
  const m = raw.trim().toLowerCase().replace(/h$/, '').match(/^(\d{1,2})(?:[:.,](\d{1,2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 24 || min > 59) return null;
  return `${pad(h === 24 ? 0 : h)}:${pad(min)}`;
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Duración en minutos; si termina a la misma hora o antes de empezar, cruza la medianoche. */
export function segmentMinutes(seg: Segment): number {
  let d = toMinutes(seg.end) - toMinutes(seg.start);
  if (d <= 0) d += 24 * 60;
  return d;
}

export function segmentsHours(segments: Segment[]): number {
  return Math.round((segments.reduce((a, s) => a + segmentMinutes(s), 0) / 60) * 100) / 100;
}

export function crossesMidnight(seg: Segment): boolean {
  return toMinutes(seg.end) <= toMinutes(seg.start);
}

/** Deduce el tipo de turno a partir de sus tramos. */
export function inferType(segments: Segment[]): ShiftType {
  if (segments.length === 0) return 'off';
  if (segments.length > 1) return 'split';
  const s = segments[0];
  const start = toMinutes(s.start);
  const end = toMinutes(s.end);
  if (start >= 20 * 60 || start < 5 * 60) return 'night';
  if (crossesMidnight(s) && end >= 60) return 'night';
  if (start < 13 * 60) return 'morning';
  return 'afternoon';
}

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function makeYmd(year: number, month1: number, day: number): string {
  return `${year}-${pad(month1)}-${pad(day)}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: string, n: number): string {
  const d = parseYmd(date);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

export const monthKey = (date: string) => date.slice(0, 7);

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** 0 = lunes … 6 = domingo */
export function weekdayIndex(date: string): number {
  return (parseYmd(date).getDay() + 6) % 7;
}

export function startOfWeek(date: string): string {
  return addDays(date, -weekdayIndex(date));
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const name = MONTHS_ES[m - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} ${y}`;
}

export function longDate(date: string): string {
  const d = parseYmd(date);
  const wd = WEEKDAYS_ES[weekdayIndex(date)];
  return `${wd[0].toUpperCase()}${wd.slice(1)}, ${d.getDate()} de ${MONTHS_ES[d.getMonth()]}`;
}

export function shortDate(date: string): string {
  const d = parseYmd(date);
  return `${d.getDate()} ${MONTHS_ES[d.getMonth()].slice(0, 3)}`;
}

export function formatHours(h: number): string {
  const r = Math.round(h * 100) / 100;
  return `${String(r).replace('.', ',')} h`;
}

export function segmentLabel(s: Segment): string {
  return `${s.start}–${s.end}`;
}

/** Momento exacto en que empieza/termina un tramo de un turno de la fecha dada. */
export function segmentBounds(date: string, seg: Segment): { start: Date; end: Date } {
  const base = parseYmd(date);
  const start = new Date(base.getTime());
  start.setHours(0, toMinutes(seg.start), 0, 0);
  const end = new Date(base.getTime());
  end.setHours(0, toMinutes(seg.start) + segmentMinutes(seg), 0, 0);
  return { start, end };
}

/** "en 2 d 3 h", "en 4 h 20 min", "en 12 min" */
export function countdown(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

/**
 * Deduce el año de un mes a partir del día de la semana de su día 1
 * (0 = lunes … 6 = domingo), eligiendo el año más cercano al de referencia.
 */
export function inferYear(month1: number, firstWeekday: number | null, ref: Date): number {
  const refYear = ref.getFullYear();
  if (firstWeekday == null) {
    // Sin pista: el mes más cercano a hoy (una cartelera suele ser del mes actual o siguiente).
    const candidates = [refYear - 1, refYear, refYear + 1];
    return candidates.reduce((best, y) => {
      const dist = Math.abs(new Date(y, month1 - 1, 15).getTime() - ref.getTime());
      const bestDist = Math.abs(new Date(best, month1 - 1, 15).getTime() - ref.getTime());
      return dist < bestDist ? y : best;
    }, refYear);
  }
  for (const delta of [0, 1, -1, 2, -2, 3, -3]) {
    const y = refYear + delta;
    if ((new Date(y, month1 - 1, 1).getDay() + 6) % 7 === firstWeekday) return y;
  }
  return refYear;
}
