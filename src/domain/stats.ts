import { addDays, daysInMonth, monthKey, segmentBounds, ymd } from './time';
import type { Segment, Shift } from './types';

export type ShiftMap = Record<string, Shift>;

export const isWorkDay = (s: Shift | undefined): boolean => !!s && s.segments.length > 0;
export const isOffDay = (s: Shift | undefined): boolean => !!s && s.type === 'off';

export interface PeriodSummary {
  /** Horas de todos los turnos del periodo (planificadas). */
  plannedHours: number;
  /** Horas de los turnos hasta hoy incluido. */
  workedHours: number;
  workDays: number;
  offDays: number;
  holidays: number;
  /** Días del periodo sin ningún dato. */
  emptyDays: number;
}

function summarize(shifts: ShiftMap, dates: string[], today: string): PeriodSummary {
  const out: PeriodSummary = { plannedHours: 0, workedHours: 0, workDays: 0, offDays: 0, holidays: 0, emptyDays: 0 };
  for (const date of dates) {
    const s = shifts[date];
    if (!s) {
      out.emptyDays++;
      continue;
    }
    if (s.isHoliday) out.holidays++;
    if (isOffDay(s)) out.offDays++;
    if (s.hours > 0) {
      out.workDays++;
      out.plannedHours += s.hours;
      if (date <= today) out.workedHours += s.hours;
    }
  }
  out.plannedHours = Math.round(out.plannedHours * 100) / 100;
  out.workedHours = Math.round(out.workedHours * 100) / 100;
  return out;
}

export function monthDates(ym: string): string[] {
  return Array.from({ length: daysInMonth(ym) }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export const monthSummary = (shifts: ShiftMap, ym: string, today: string) => summarize(shifts, monthDates(ym), today);
export const weekSummary = (shifts: ShiftMap, weekStart: string, today: string) =>
  summarize(shifts, weekDates(weekStart), today);

export interface UpcomingSegment {
  shift: Shift;
  segment: Segment;
  start: Date;
  end: Date;
  /** true si el tramo ya ha empezado y aún no ha terminado. */
  inProgress: boolean;
}

/** Tramos de trabajo que aún no han terminado, en orden cronológico. */
export function upcomingSegments(shifts: ShiftMap, now: Date, days = 60): UpcomingSegment[] {
  const out: UpcomingSegment[] = [];
  // Empieza ayer: un turno de noche de ayer puede seguir en curso.
  let date = addDays(ymd(now), -1);
  for (let i = 0; i <= days; i++, date = addDays(date, 1)) {
    const s = shifts[date];
    if (!s || !isWorkDay(s)) continue;
    for (const segment of s.segments) {
      const { start, end } = segmentBounds(date, segment);
      if (end.getTime() <= now.getTime()) continue;
      out.push({ shift: s, segment, start, end, inProgress: start.getTime() <= now.getTime() });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export const nextSegment = (shifts: ShiftMap, now: Date) => upcomingSegments(shifts, now, 60)[0] ?? null;

/** Meses (YYYY-MM) que tienen al menos un turno, ordenados. */
export function monthsWithData(shifts: ShiftMap): string[] {
  return [...new Set(Object.keys(shifts).map(monthKey))].sort();
}
