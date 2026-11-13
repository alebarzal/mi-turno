import { describe, expect, it } from 'vitest';

import { monthAsText, monthsAsIcs } from '../export';
import type { Shift } from '../types';

const shift = (date: string, code: string, p: Partial<Shift> = {}): Shift => ({
  date,
  code,
  type: 'morning',
  segments: [{ start: '07:00', end: '15:00' }],
  hours: 8,
  isHoliday: false,
  notes: '',
  boardId: null,
  manual: false,
  ...p,
});

const shifts = {
  '2026-11-02': shift('2026-11-02', 'M', { segments: [{ start: '07:00', end: '15:00', location: 'Sala 2' }] }),
  '2026-11-03': shift('2026-11-03', 'D', { type: 'off', segments: [], hours: 0 }),
  '2026-11-04': shift('2026-11-04', 'N', { type: 'night', segments: [{ start: '22:00', end: '06:00' }] }),
};

describe('exportar el mes', () => {
  it('como texto para mensajes', () => {
    const txt = monthAsText(shifts, '2026-11', '2026-11-01');
    expect(txt.split('\n')).toEqual([
      'Mis turnos · Noviembre 2026',
      '',
      'L  2 · M · 07:00–15:00 · Sala 2',
      'M  3 · Libre',
      'X  4 · N · 22:00–06:00 (+1)',
      '',
      '16 h · 2 turnos · 1 libres',
    ]);
    expect(monthAsText(shifts, '2026-12', '2026-11-01')).toBe('');
  });

  it('como calendario .ics', () => {
    const ics = monthsAsIcs(shifts, ['2026-11'], new Date('2026-11-13T10:00:00Z'));
    const events = ics.split('BEGIN:VEVENT').slice(1);
    expect(events).toHaveLength(2); // el día libre no se exporta
    expect(events[0]).toContain('DTSTART:20261102T070000');
    expect(events[0]).toContain('LOCATION:Sala 2');
    expect(events[1]).toContain('DTSTART:20261104T220000');
    expect(events[1]).toContain('DTEND:20261105T060000'); // termina al día siguiente
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
  });
});
