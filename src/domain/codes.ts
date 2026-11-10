import type { ExtractedLegendEntry } from '../recognition/types';
import { inferType, normalizeTime, segmentsHours } from './time';
import type { CodeDef, Segment, ShiftType } from './types';

export type Dictionary = Record<string, CodeDef>;

export const normalizeCode = (raw: string) => raw.trim().toUpperCase().replace(/\s+/g, '');

const COLON = 'Colón';
const EULALIA = 'Sta. Eulalia';

function def(
  code: string,
  label: string,
  segments: Segment[],
  endOptions?: string[],
  type?: ShiftType,
): CodeDef {
  return {
    code,
    label,
    type: type ?? inferType(segments),
    segments,
    endOptions,
    source: 'initial',
    updatedAt: '2026-11-10T00:00:00.000Z',
  };
}

/**
 * Diccionario inicial: transcripción literal de la leyenda «HORARIOS NOVIEMBRE y DICIEMBRE»
 * de la cartelera de referencia. No se añade ningún código que no esté en esa leyenda,
 * salvo «D» (descanso). Todo es editable desde la app.
 */
export const INITIAL_CODES: CodeDef[] = [
  def('D', 'Descanso', [], undefined, 'off'),
  def('M', 'Mañana', [{ start: '08:00', end: '15:00', location: COLON }]),
  def('MA', 'Mañana A', [{ start: '09:00', end: '15:00', location: COLON }], ['15:00', '16:00']),
  def('MB', 'Mañana B', [{ start: '10:00', end: '15:00', location: COLON }], ['15:00', '16:00', '17:00']),
  def('T', 'Tarde', [{ start: '15:00', end: '21:00', location: COLON }], ['21:00', '22:00', '23:00']),
  def('TA', 'Tarde A', [{ start: '16:00', end: '22:00', location: COLON }], ['22:00', '23:00', '00:00']),
  def('T4', 'Tarde 4 h', [{ start: '17:00', end: '21:00', location: COLON }]),
  def('CS', 'Partido Colón / Sta. Eulalia', [
    { start: '10:00', end: '14:00', location: COLON },
    { start: '17:00', end: '21:00', location: EULALIA },
  ]),
  def('VCS', 'Partido Colón / Sta. Eulalia (tarde-noche)', [
    { start: '11:30', end: '14:30', location: COLON },
    { start: '18:00', end: '23:00', location: EULALIA },
  ]),
  def('FS', 'Partido Sta. Eulalia (tarde-noche)', [
    { start: '11:30', end: '14:30', location: EULALIA },
    { start: '18:00', end: '23:00', location: EULALIA },
  ]),
  def('MT', 'Partido Sta. Eulalia', [
    { start: '10:00', end: '14:00', location: EULALIA },
    { start: '17:00', end: '21:00', location: EULALIA },
  ]),
  def(
    'HE',
    'Partido Sta. Eulalia',
    [
      { start: '11:30', end: '14:30', location: EULALIA },
      { start: '17:00', end: '21:00', location: EULALIA },
    ],
    ['21:00', '22:00'],
  ),
  def('NV', 'Nochevieja universitaria (partido)', [
    { start: '11:00', end: '15:00', location: COLON },
    { start: '19:00', end: '23:00', location: COLON },
  ]),
  def('TN', 'Nochevieja universitaria (noche)', [{ start: '17:00', end: '01:00', location: EULALIA }]),
];

export function toDictionary(codes: CodeDef[]): Dictionary {
  const d: Dictionary = {};
  for (const c of codes) d[c.code] = c;
  return d;
}

/** Todas las variantes posibles de un código: una por cada hora de salida alternativa. */
export function codeVariants(c: CodeDef): { segments: Segment[]; hours: number }[] {
  if (c.segments.length === 0) return [{ segments: [], hours: 0 }];
  const ends = c.endOptions && c.endOptions.length > 0 ? c.endOptions : [c.segments[c.segments.length - 1].end];
  return ends.map((end) => {
    const segments = c.segments.map((s, i) => (i === c.segments.length - 1 ? { ...s, end } : { ...s }));
    return { segments, hours: segmentsHours(segments) };
  });
}

function prettyLocation(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim().replace(/\s+/g, ' ');
  if (!t) return undefined;
  if (/^col[oó]n$/i.test(t)) return COLON;
  if (/^sta\.?\s*eulalia$/i.test(t)) return EULALIA;
  return t
    .toLowerCase()
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Convierte una entrada de la leyenda leída en la imagen en una definición de código. null si no es válida. */
export function legendEntryToCode(entry: ExtractedLegendEntry, now: string): CodeDef | null {
  const code = normalizeCode(entry.code);
  if (!code || entry.segments.length === 0) return null;
  const segments: Segment[] = [];
  let endOptions: string[] | undefined;
  for (let i = 0; i < entry.segments.length; i++) {
    const s = entry.segments[i];
    const start = normalizeTime(s.start);
    const ends = s.endOptions.map(normalizeTime).filter((e): e is string => e !== null);
    if (!start || ends.length === 0 || ends.length !== s.endOptions.length) return null;
    // Solo el último tramo puede tener varias salidas; si otro las tiene, no sabemos interpretarlo.
    if (ends.length > 1 && i !== entry.segments.length - 1) return null;
    if (ends.length > 1) endOptions = ends;
    segments.push({ start, end: ends[0], location: prettyLocation(s.location) });
  }
  return {
    code,
    label: entry.title?.trim() || code,
    type: inferType(segments),
    segments,
    endOptions,
    source: 'legend',
    updatedAt: now,
  };
}

function sameDefinition(a: CodeDef, b: CodeDef): boolean {
  const norm = (c: CodeDef) =>
    JSON.stringify([
      c.segments.map((s) => [s.start, s.end, (s.location ?? '').toLowerCase()]),
      c.endOptions && c.endOptions.length > 1 ? c.endOptions : null,
    ]);
  return norm(a) === norm(b);
}

/**
 * Combina el diccionario guardado con la leyenda de la imagen.
 * - Lo que el usuario ha corregido a mano («user») nunca se pisa.
 * - 'override': la leyenda manda sobre lo demás (lectura fiable).
 * - 'fill': la leyenda solo añade códigos que faltan (lectura poco fiable).
 */
export function mergeLegend(
  dict: Dictionary,
  legend: ExtractedLegendEntry[],
  policy: 'override' | 'fill',
  now: string,
): { dict: Dictionary; changed: CodeDef[] } {
  const out: Dictionary = { ...dict };
  const changed: CodeDef[] = [];
  for (const entry of legend) {
    const parsed = legendEntryToCode(entry, now);
    if (!parsed) continue;
    const existing = out[parsed.code];
    if (existing?.source === 'user') continue;
    if (existing && policy === 'fill') continue;
    if (existing && sameDefinition(existing, parsed)) continue;
    // Conserva el nombre legible que ya tuviera el código.
    if (existing && (!entry.title || parsed.label === parsed.code)) parsed.label = existing.label;
    out[parsed.code] = parsed;
    changed.push(parsed);
  }
  return { dict: out, changed };
}
