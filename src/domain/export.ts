import { monthDates, monthSummary } from './stats';
import { addDays, crossesMidnight, formatHours, monthLabel, parseYmd, weekdayIndex, WEEKDAY_LETTERS } from './time';
import type { Shift, ShiftType } from './types';

type ShiftMap = Record<string, Shift>;

const TYPE_NAME: Record<ShiftType, string> = {
  morning: 'Mañana',
  afternoon: 'Tarde',
  night: 'Noche',
  split: 'Partido',
  off: 'Libre',
  other: 'Turno',
};

/** Descripción corta de un día para mandarla por mensaje: «07:00–15:00» o «Libre». */
function dayText(s: Shift): string {
  if (s.type === 'off' || s.segments.length === 0) return s.isHoliday ? 'Libre (festivo)' : 'Libre';
  const times = s.segments.map((g) => `${g.start}–${g.end}${crossesMidnight(g) ? ' (+1)' : ''}`).join(' y ');
  const place = [...new Set(s.segments.map((g) => g.location).filter(Boolean))].join(', ');
  return `${s.code} · ${times}${place ? ` · ${place}` : ''}${s.isHoliday ? ' · festivo' : ''}`;
}

/** El mes en texto plano, listo para pegar en WhatsApp. Solo los días con turno. */
export function monthAsText(shifts: ShiftMap, ym: string, today: string): string {
  const lines = monthDates(ym)
    .filter((d) => shifts[d])
    .map((d) => `${WEEKDAY_LETTERS[weekdayIndex(d)]} ${String(parseYmd(d).getDate()).padStart(2, ' ')} · ${dayText(shifts[d]!)}`);
  if (!lines.length) return '';
  const sum = monthSummary(shifts, ym, today);
  return [
    `Mis turnos · ${monthLabel(ym)}`,
    '',
    ...lines,
    '',
    `${formatHours(sum.plannedHours)} · ${sum.workDays} turnos · ${sum.offDays} libres`,
  ].join('\n');
}

const icsDate = (date: string, time: string) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

/**
 * Calendario .ics con un evento por tramo de trabajo, para importarlo en Google Calendar,
 * Outlook o el calendario del teléfono. Horas «flotantes»: se leen en la zona horaria local.
 */
export function monthsAsIcs(shifts: ShiftMap, months: string[], stamp = new Date()): string {
  const now = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const events: string[] = [];
  for (const ym of months) {
    for (const d of monthDates(ym)) {
      const s = shifts[d];
      if (!s || s.type === 'off') continue;
      s.segments.forEach((g, i) => {
        const endDate = crossesMidnight(g) ? addDays(d, 1) : d;
        const title = `${TYPE_NAME[s.type]} (${s.code})${s.isHoliday ? ' · festivo' : ''}`;
        events.push(
          [
            'BEGIN:VEVENT',
            `UID:${d}-${i}@mi-turno`,
            `DTSTAMP:${now}`,
            `DTSTART:${icsDate(d, g.start)}`,
            `DTEND:${icsDate(endDate, g.end)}`,
            `SUMMARY:${icsText(title)}`,
            ...(g.location ? [`LOCATION:${icsText(g.location)}`] : []),
            ...(s.notes ? [`DESCRIPTION:${icsText(s.notes)}`] : []),
            'END:VEVENT',
          ].join('\r\n'),
        );
      });
    }
  }
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mi Turno//ES', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR', ''].join('\r\n');
}
