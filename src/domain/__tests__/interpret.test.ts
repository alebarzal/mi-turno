import { describe, expect, it } from 'vitest';

import { SAMPLE_EXTRACTION } from '../../recognition/__tests__/fixture';
import { INITIAL_CODES, legendEntryToCode, mergeLegend, toDictionary } from '../codes';
import { interpretBoard, resolveShift } from '../interpret';
import { monthSummary, nextSegment } from '../stats';
import { inferType, inferYear, segmentsHours } from '../time';
import type { Shift } from '../types';

const NOW = new Date(2026, 10, 10, 9, 0);
const dict = toDictionary(INITIAL_CODES);

describe('cartelera de referencia (noviembre y diciembre de 2026, fila ALEX)', () => {
  const result = interpretBoard(SAMPLE_EXTRACTION, dict, { now: NOW });
  const byDate = Object.fromEntries(result.drafts.map((d) => [d.date, d]));

  it('deduce el año por el día de la semana del día 1', () => {
    expect(result.months.map((m) => m.month)).toEqual(['2026-11', '2026-12']);
  });

  it('las horas suman lo mismo que la cartelera', () => {
    expect(result.months[0].computedTotal).toBe(139);
    expect(result.months[1].computedTotal).toBe(169);
    expect(result.months[0].statedTotal).toBe(139);
  });

  it('no deja ningún día dudoso', () => {
    expect(result.drafts).toHaveLength(61);
    expect(result.drafts.filter((d) => d.issues.length > 0)).toEqual([]);
  });

  it('la leyenda de la imagen coincide con el diccionario inicial', () => {
    expect(result.legendCodes).toEqual([]);
  });

  it('convierte los códigos en horarios según las horas indicadas', () => {
    expect(byDate['2026-11-01'].segments).toEqual([
      { start: '11:30', end: '14:30', location: 'Sta. Eulalia' },
      { start: '17:00', end: '21:00', location: 'Sta. Eulalia' },
    ]);
    // HE con 8 horas: sale a las 22:00.
    expect(byDate['2026-12-25'].segments[1].end).toBe('22:00');
    expect(byDate['2026-12-25'].isHoliday).toBe(true);
    // MB 6 → 10:00–16:00; MB 7 → 10:00–17:00.
    expect(byDate['2026-11-07'].segments).toEqual([{ start: '10:00', end: '16:00', location: 'Colón' }]);
    expect(byDate['2026-12-13'].segments[0].end).toBe('17:00');
    // T 8 → 15:00–23:00; T 7 → 15:00–22:00.
    expect(byDate['2026-11-27'].segments[0].end).toBe('23:00');
    expect(byDate['2026-12-23'].segments[0].end).toBe('22:00');
    // TA 8 termina a medianoche.
    expect(byDate['2026-11-21'].segments[0]).toMatchObject({ start: '16:00', end: '00:00' });
    expect(byDate['2026-11-21'].hours).toBe(8);
    expect(byDate['2026-11-02']).toMatchObject({ code: 'D', type: 'off', hours: 0, isHoliday: true });
  });

  it('resume el mes y encuentra el próximo turno', () => {
    const shifts: Record<string, Shift> = byDate;
    const nov = monthSummary(shifts, '2026-11', '2026-11-10');
    expect(nov.plannedHours).toBe(139);
    expect(nov.workDays).toBe(18);
    expect(nov.offDays).toBe(12);
    // Hasta el 10 incluido: 7+8+8+8+6+8 = 45
    expect(nov.workedHours).toBe(45);
    const next = nextSegment(shifts, NOW)!;
    expect(next.shift.date).toBe('2026-11-10');
    expect(next.segment.start).toBe('10:00');
    expect(next.inProgress).toBe(false);
  });
});

describe('resolveShift', () => {
  it('pide confirmación para códigos desconocidos en vez de inventar un horario', () => {
    const d = resolveShift('2026-11-03', 'C', 8, dict);
    expect(d.issues).toEqual(['unknown_code']);
    expect(d.segments).toEqual([]);
  });

  it('marca las horas que no cuadran con ninguna variante', () => {
    const d = resolveShift('2026-11-03', 'M', 8, dict);
    expect(d.issues).toEqual(['hours_mismatch']);
    expect(d.hours).toBe(8);
    expect(d.segments[0]).toMatchObject({ start: '08:00', end: '15:00' });
  });

  it('marca como ambiguo un código con varias salidas si no hay horas', () => {
    expect(resolveShift('2026-11-03', 'T', null, dict).issues).toEqual(['ambiguous_variant']);
    expect(resolveShift('2026-11-03', 'CS', null, dict).issues).toEqual([]);
  });

  it('marca los días sin lectura', () => {
    expect(resolveShift('2026-11-03', null, null, dict).issues).toEqual(['missing']);
  });
});

describe('diccionario', () => {
  it('lo corregido por el usuario no lo pisa la leyenda', () => {
    const user = { ...dict, CS: { ...dict.CS, source: 'user' as const, segments: [{ start: '09:00', end: '17:00' }] } };
    const { dict: merged, changed } = mergeLegend(user, SAMPLE_EXTRACTION.legend, 'override', NOW.toISOString());
    expect(merged.CS.segments).toEqual([{ start: '09:00', end: '17:00' }]);
    expect(changed).toEqual([]);
  });

  it('aprende códigos nuevos de la leyenda', () => {
    const { changed } = mergeLegend(
      dict,
      [{ code: 'N', title: 'Noche', segments: [{ start: '22:00', endOptions: ['06:00'], location: 'COLÓN' }] }],
      'override',
      NOW.toISOString(),
    );
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ code: 'N', type: 'night', source: 'legend' });
    expect(segmentsHours(changed[0].segments)).toBe(8);
  });

  it('descarta entradas de leyenda con horas ilegibles', () => {
    expect(
      legendEntryToCode({ code: 'Z', title: null, segments: [{ start: '1O:00', endOptions: ['14:00'], location: null }] }, ''),
    ).toBeNull();
  });
});

describe('utilidades de tiempo', () => {
  it('clasifica los turnos', () => {
    expect(inferType([{ start: '08:00', end: '15:00' }])).toBe('morning');
    expect(inferType([{ start: '16:00', end: '00:00' }])).toBe('afternoon');
    expect(inferType([{ start: '17:00', end: '01:00' }])).toBe('night');
    expect(inferType([{ start: '22:00', end: '06:00' }])).toBe('night');
    expect(inferType([])).toBe('off');
  });

  it('deduce el año', () => {
    expect(inferYear(11, 6, NOW)).toBe(2026);
    expect(inferYear(1, 4, NOW)).toBe(2027); // 1 de enero de 2027 es viernes
    expect(inferYear(1, null, new Date(2026, 11, 20))).toBe(2027);
  });
});
