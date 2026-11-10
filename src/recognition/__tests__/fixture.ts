import type { BoardExtraction, ExtractedDay, ExtractedLegendEntry } from '../types';

/**
 * Cartelera de referencia para las pruebas (noviembre y diciembre de 2026, fila ALEX).
 * Comprueba la interpretación de principio a fin:
 * las horas suman 139 (noviembre) y 169 (diciembre), igual que en la cartelera.
 */

type Cell = [code: string, hours?: number];

const NOV: Cell[] = [
  ['HE', 7], ['D'], ['D'], ['MT', 8], ['MT', 8], ['FS', 8], ['MB', 6], ['D'],
  ['D'], ['CS', 8], ['CS', 8], ['CS', 8], ['FS', 8], ['FS', 8], ['D'],
  ['D'], ['CS', 8], ['CS', 8], ['D'], ['D'], ['TA', 8], ['D'],
  ['D'], ['CS', 8], ['CS', 8], ['CS', 8], ['T', 8], ['MB', 6], ['D'], ['D'],
];

const DEC: Cell[] = [
  ['D'], ['CS', 8], ['CS', 8], ['T', 8], ['FS', 8], ['FS', 8],
  ['D'], ['D'], ['CS', 8], ['CS', 8], ['VCS', 8], ['FS', 8], ['MB', 7],
  ['D'], ['T', 8], ['CS', 8], ['NV', 8], ['VCS', 8], ['MB', 6], ['D'],
  ['D'], ['CS', 8], ['T', 7], ['D'], ['HE', 8], ['MB', 6], ['MB', 7],
  ['D'], ['D'], ['CS', 8], ['CS', 8],
];

const days = (cells: Cell[], holidays: number[]): ExtractedDay[] =>
  cells.map(([code, hours], i) => ({
    day: i + 1,
    code,
    hours: hours ?? null,
    holiday: holidays.includes(i + 1),
    uncertain: false,
  }));

const seg = (start: string, ends: string, location: string) => ({ start, endOptions: ends.split('/'), location });

export const SAMPLE_LEGEND: ExtractedLegendEntry[] = [
  { code: 'CS', title: null, segments: [seg('10:00', '14:00', 'COLÓN'), seg('17:00', '21:00', 'STA EULALIA')] },
  { code: 'VCS', title: null, segments: [seg('11:30', '14:30', 'COLÓN'), seg('18:00', '23:00', 'STA EULALIA')] },
  { code: 'FS', title: null, segments: [seg('11:30', '14:30', 'STA EULALIA'), seg('18:00', '23:00', 'STA EULALIA')] },
  { code: 'MT', title: null, segments: [seg('10:00', '14:00', 'STA EULALIA'), seg('17:00', '21:00', 'STA EULALIA')] },
  { code: 'HE', title: null, segments: [seg('11:30', '14:30', 'STA EULALIA'), seg('17:00', '21:00/22:00', 'STA EULALIA')] },
  { code: 'M', title: null, segments: [seg('08:00', '15:00', 'COLÓN')] },
  { code: 'MA', title: null, segments: [seg('09:00', '15:00/16:00', 'COLÓN')] },
  { code: 'MB', title: null, segments: [seg('10:00', '15:00/16:00/17:00', 'COLÓN')] },
  { code: 'T', title: null, segments: [seg('15:00', '21:00/22:00/23:00', 'COLÓN')] },
  { code: 'TA', title: null, segments: [seg('16:00', '22:00/23:00/00:00', 'COLÓN')] },
  { code: 'T4', title: null, segments: [seg('17:00', '21:00', 'COLÓN')] },
  {
    code: 'NV',
    title: 'Nochevieja universitaria (partido)',
    segments: [seg('11:00', '15:00', 'COLÓN'), seg('19:00', '23:00', 'COLÓN')],
  },
  { code: 'TN', title: 'Nochevieja universitaria (noche)', segments: [seg('17:00', '01:00', 'STA EULALIA')] },
];

export const SAMPLE_EXTRACTION: BoardExtraction = {
  engine: 'local',
  employeeName: 'ALEX',
  employeeFound: true,
  months: [
    {
      month: 11,
      year: null,
      firstWeekday: 6, // el día 1 cae en domingo
      days: days(NOV, [2]),
      summary: { compensationHours: 0, workedHours: 139, totalWorkedHours: null, pendingHours: null },
    },
    {
      month: 12,
      year: null,
      firstWeekday: 1, // el día 1 cae en martes
      days: days(DEC, [6, 8, 25]),
      summary: { compensationHours: null, workedHours: 169, totalWorkedHours: null, pendingHours: null },
    },
  ],
  legend: SAMPLE_LEGEND,
  warnings: [],
};
