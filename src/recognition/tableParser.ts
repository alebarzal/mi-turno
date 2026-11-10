/**
 * Reconstruye la fila de un trabajador a partir de las palabras sueltas (con su posición)
 * que devuelve un OCR. Es código puro: no depende de ningún motor de OCR concreto.
 *
 * Idea: se localiza la etiqueta del trabajador, se busca encima la fila de números de día
 * (una secuencia creciente 1..31 sobre una misma recta, aunque la foto esté inclinada) y se
 * asigna cada código y cada número de horas a la columna de día más cercana.
 */
import { MONTHS_ES, WEEKDAY_LETTERS } from '../domain/time';
import type {
  BoardExtraction,
  ExtractedDay,
  ExtractedLegendEntry,
  ExtractedMonth,
} from './types';

export interface OcrWord {
  text: string;
  /** Esquina superior izquierda y tamaño, en píxeles de la imagen. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Identificador de la línea a la que el OCR asignó la palabra. */
  line: number;
}

interface W extends OcrWord {
  cx: number;
  cy: number;
  norm: string;
}

export const normText = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const MONTHS_NORM = MONTHS_ES.map(normText);
// "SETIEMBRE" también se usa.
const monthOf = (norm: string) => (norm === 'SETIEMBRE' ? 9 : MONTHS_NORM.indexOf(norm) + 1);

const isDayNumber = (w: W) => /^\d{1,2}$/.test(w.norm) && Number(w.norm) >= 1 && Number(w.norm) <= 31;
const isCode = (w: W) => /^[A-Z][A-Z0-9]{0,3}$/.test(w.norm);
const hoursOf = (w: W): number | null => {
  const m = w.text.trim().match(/^(\d{1,2})(?:[.,](\d))?$/);
  if (!m) return null;
  const v = Number(m[1]) + (m[2] ? Number(m[2]) / 10 : 0);
  return v > 0 && v <= 24 ? v : null;
};

/** Longitud de la subsecuencia estrictamente creciente más larga, y sus elementos. */
function longestIncreasing<T>(items: T[], value: (t: T) => number): T[] {
  const n = items.length;
  if (n === 0) return [];
  const len = new Array<number>(n).fill(1);
  const prev = new Array<number>(n).fill(-1);
  let best = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (value(items[j]) < value(items[i]) && len[j] + 1 > len[i]) {
        len[i] = len[j] + 1;
        prev[i] = j;
      }
    }
    if (len[i] > len[best]) best = i;
  }
  const out: T[] = [];
  for (let i = best; i >= 0; i = prev[i]) out.unshift(items[i]);
  return out;
}

interface Header {
  /** Recta de la cabecera: y = a + slope * x */
  a: number;
  slope: number;
  /** Centro x de cada día detectado. */
  columns: Map<number, number>;
  pitch: number;
}

/** Busca la fila de números de día situada encima de la etiqueta del trabajador. */
function findHeader(words: W[], anchor: W): Header | null {
  const h = anchor.h;
  const cands = words.filter(
    (w) => isDayNumber(w) && w.cx > anchor.x + anchor.w && w.cy < anchor.cy - 0.5 * h && w.cy > anchor.cy - 45 * h,
  );
  if (cands.length < 8) return null;

  type Hyp = { seq: W[]; a: number; slope: number; dist: number };
  const hyps: Hyp[] = [];
  for (let i = 0; i < cands.length; i++) {
    for (let j = 0; j < cands.length; j++) {
      const p = cands[i];
      const q = cands[j];
      if (q.cx - p.cx < 8 * h || Number(q.norm) <= Number(p.norm)) continue;
      const slope = (q.cy - p.cy) / (q.cx - p.cx);
      if (Math.abs(slope) > 0.2) continue;
      const a = p.cy - slope * p.cx;
      const inliers = cands
        .filter((w) => Math.abs(w.cy - (a + slope * w.cx)) < 0.45 * h)
        .sort((u, v) => u.cx - v.cx);
      const seq = longestIncreasing(inliers, (w) => Number(w.norm));
      if (seq.length < 8) continue;
      const dist = anchor.cy - (a + slope * anchor.cx);
      if (dist > 0) hyps.push({ seq, a, slope, dist });
    }
  }
  if (hyps.length === 0) return null;
  // Gana la secuencia más larga; entre las casi igual de largas, la más cercana al trabajador
  // (así no se confunde con la cabecera de otra tabla que haya más arriba).
  const longest = Math.max(...hyps.map((x) => x.seq.length));
  const best = hyps
    .filter((x) => x.seq.length >= longest - 2)
    .sort((x, y) => (Math.abs(x.dist - y.dist) > h ? x.dist - y.dist : y.seq.length - x.seq.length))[0];

  const columns = new Map<number, number>();
  for (const w of best.seq) columns.set(Number(w.norm), w.cx);
  // Paso entre columnas: mediana de (Δx / Δdía) entre días detectados consecutivos.
  const days = [...columns.keys()].sort((x, y) => x - y);
  const steps: number[] = [];
  for (let i = 1; i < days.length; i++) {
    steps.push((columns.get(days[i])! - columns.get(days[i - 1])!) / (days[i] - days[i - 1]));
  }
  const pitch = median(steps);
  if (!(pitch > 0)) return null;
  return { a: best.a, slope: best.slope, columns, pitch };
}

/** Posición x de un día, interpolando si el OCR no leyó su número en la cabecera. */
function columnX(header: Header, day: number): number {
  const known = header.columns.get(day);
  if (known != null) return known;
  const days = [...header.columns.keys()].sort((x, y) => x - y);
  let lo: number | null = null;
  let hi: number | null = null;
  for (const d of days) {
    if (d < day) lo = d;
    if (d > day && hi == null) hi = d;
  }
  if (lo != null && hi != null) {
    const xl = header.columns.get(lo)!;
    const xh = header.columns.get(hi)!;
    return xl + ((xh - xl) * (day - lo)) / (hi - lo);
  }
  if (lo != null) return header.columns.get(lo)! + (day - lo) * header.pitch;
  return header.columns.get(hi!)! - (hi! - day) * header.pitch;
}

function findMonth(words: W[], byLine: Map<number, W[]>, headerY: number, anchor: W): number | null {
  let best: { month: number; dist: number } | null = null;
  for (const w of words) {
    const month = monthOf(w.norm);
    if (!month) continue;
    // El título de la leyenda («HORARIOS NOVIEMBRE y DICIEMBRE») no es el título de una tabla.
    const line = byLine.get(w.line) ?? [];
    if (line.some((o) => o.norm.startsWith('HORARIO')) || line.filter((o) => monthOf(o.norm)).length > 1) continue;
    const dy = headerY - w.cy;
    if (dy < -0.5 * anchor.h) continue;
    if (!best || dy < best.dist) best = { month, dist: dy };
  }
  return best?.month ?? null;
}

function findFirstWeekday(words: W[], header: Header, h: number): number | null {
  const votes = new Map<number, number>();
  for (const w of words) {
    if (w.norm.length !== 1) continue;
    const idx = WEEKDAY_LETTERS.indexOf(w.norm);
    if (idx < 0) continue;
    const dy = header.a + header.slope * w.cx - w.cy;
    if (dy < 0.4 * h || dy > 2.6 * h) continue;
    for (const [day, x] of header.columns) {
      if (Math.abs(x - w.cx) < 0.4 * header.pitch) {
        // «M» puede ser martes; «X» es miércoles: la letra no es ambigua en esta notación.
        const first = (((idx - (day - 1)) % 7) + 7) % 7;
        votes.set(first, (votes.get(first) ?? 0) + 1);
      }
    }
  }
  let best: number | null = null;
  for (const [k, v] of votes) if (best == null || v > votes.get(best)!) best = k;
  return best != null && votes.get(best)! >= 3 ? best : null;
}

/** Letras y cifras que un OCR confunde entre sí. */
const LOOKALIKE = ['O0QD', 'S5', 'B8', 'I1LT', 'CG', 'Z2'];
const alike = (a: string, b: string) => a === b || LOOKALIKE.some((g) => g.includes(a) && g.includes(b));

/** Códigos conocidos que encajan con lo leído, tolerando confusiones típicas («O» por «D»). */
function matchKnown(text: string, known: Set<string>): string[] {
  if (known.has(text)) return [text];
  const out: string[] = [];
  for (const k of known) {
    if (k.length === text.length && [...k].every((ch, i) => alike(ch, text[i]))) out.push(k);
  }
  return out;
}

/**
 * Interpreta el texto de una palabra de la fila de códigos. Devuelve varios códigos cuando el
 * OCR ha unido celdas vecinas, y `sure: false` cuando hay más de una lectura posible.
 */
function readCodes(text: string, known: Set<string>): { codes: string[]; sure: boolean } | null {
  if (!/^[A-Z0-9]{1,8}$/.test(text)) return null;
  const plain = /^[A-Z][A-Z0-9]{0,3}$/.test(text);
  if (known.size === 0) return plain ? { codes: [text], sure: true } : null;
  const direct = matchKnown(text, known);
  if (direct.length === 1) return { codes: direct, sure: true };
  if (direct.length > 1) return { codes: [direct[0]], sure: false };

  const splits: string[][] = [];
  const walk = (from: number, acc: string[]) => {
    if (splits.length > 8) return;
    if (from === text.length) {
      splits.push(acc);
      return;
    }
    for (let to = from + 1; to <= Math.min(text.length, from + 4); to++) {
      const m = matchKnown(text.slice(from, to), known);
      if (m.length === 1) walk(to, [...acc, m[0]]);
    }
  };
  walk(0, []);
  if (splits.length > 0) {
    // Con varias particiones posibles, la de menos trozos, y se marca para revisar.
    const best = [...splits].sort((a, b) => a.length - b.length)[0];
    return { codes: best, sure: splits.length === 1 };
  }
  // Código que no está en el diccionario: se entrega tal cual para que el usuario lo defina.
  return plain ? { codes: [text], sure: true } : null;
}

function parseTable(
  words: W[],
  byLine: Map<number, W[]>,
  anchor: W,
  now: Date,
  notes: string[],
  known: Set<string>,
): ExtractedMonth | null {
  const header = findHeader(words, anchor);
  if (!header) {
    const above = words.filter((w) => isDayNumber(w) && w.cy < anchor.cy).length;
    notes.push(`No se ha localizado la fila de números de día encima de tu nombre (${above} números leídos por encima).`);
    return null;
  }
  const h = anchor.h;

  // Separación entre filas: distancia a la siguiente etiqueta de la columna de nombres.
  const sameColumn = words.filter(
    (w) => w !== anchor && Math.abs(w.x - anchor.x) < 4 * h && /^[A-Z]{3,}$/.test(w.norm) && !monthOf(w.norm),
  );
  const below = sameColumn.filter((w) => w.cy > anchor.cy + 0.8 * h).map((w) => w.cy - anchor.cy);
  const above = sameColumn.filter((w) => w.cy < anchor.cy - 0.8 * h).map((w) => anchor.cy - w.cy);
  let rowPitch = Math.min(...below, ...above, Infinity);
  if (!Number.isFinite(rowPitch) || rowPitch > 5 * h) rowPitch = 2.3 * h;

  const maxHeaderDay = Math.max(...header.columns.keys());
  let month = findMonth(words, byLine, header.a + header.slope * anchor.cx, anchor);
  if (!month) {
    // Sin título de mes legible: se propone el mes actual y se avisa para que se corrija en la revisión.
    month = now.getMonth() + 1;
    notes.push('No se ha podido leer el nombre del mes: comprueba que el mes propuesto es el correcto.');
  }
  const firstWeekday = findFirstWeekday(words, header, h);
  let dayCount = maxHeaderDay;
  if (month) {
    dayCount = month === 2 ? Math.min(29, Math.max(28, maxHeaderDay)) : new Date(now.getFullYear(), month, 0).getDate();
  }
  const firstX = columnX(header, 1) - 0.5 * header.pitch;
  const lastX = columnX(header, dayCount) + 0.5 * header.pitch;

  interface Cand {
    code: string;
    /** Desviación con signo respecto al centro de la columna. */
    off: number;
    cx: number;
    sure: boolean;
    /** Texto leído y extremos de la palabra, para recomponer códigos partidos. */
    raw: string;
    x0: number;
    x1: number;
    /** Trozo que por sí solo no es un código. */
    weak?: boolean;
  }
  const cands = new Map<number, Cand[]>();
  const add = (day: number, c: Cand) => {
    const l = cands.get(day);
    if (l) l.push(c);
    else cands.set(day, [c]);
  };
  const hours = new Map<number, { v: number; dx: number }>();

  for (const w of words) {
    if (w === anchor || w.cx < firstX || w.cx > lastX) continue;
    // Altura relativa a la línea de códigos del trabajador, corrigiendo la inclinación.
    const dy = w.cy - (anchor.cy + header.slope * (w.cx - anchor.cx));
    if (dy < -0.35 * rowPitch || dy > 0.8 * rowPitch) continue;

    let day = 1;
    let dx = Infinity;
    for (let d = 1; d <= dayCount; d++) {
      const dist = Math.abs(columnX(header, d) - w.cx);
      if (dist < dx) {
        dx = dist;
        day = d;
      }
    }

    const hv = hoursOf(w);
    if (hv != null && dy > 0.15 * rowPitch) {
      if (dx > 0.5 * header.pitch) continue;
      const prev = hours.get(day);
      if (!prev || dx < prev.dx) hours.set(day, { v: hv, dx });
      continue;
    }
    if (dy >= 0.35 * rowPitch || /^\d+$/.test(w.norm) && dy > 0.15 * rowPitch) continue;
    const read = readCodes(w.norm, known);
    const span = { raw: w.norm, x0: w.x, x1: w.x + w.w };
    if (!read) {
      if (dx <= 0.5 * header.pitch && /^[A-Z0-9]{1,2}$/.test(w.norm)) {
        add(day, { code: w.norm, off: w.cx - columnX(header, day), cx: w.cx, sure: false, weak: true, ...span });
      }
      continue;
    }
    if (read.codes.length === 1) {
      if (dx > 0.5 * header.pitch) continue;
      add(day, { code: read.codes[0], off: w.cx - columnX(header, day), cx: w.cx, sure: read.sure, ...span });
      continue;
    }
    // El OCR ha pegado los códigos de varias celdas seguidas («MBD» = MB + D): se reparten
    // entre las columnas que ocupa la palabra.
    const k = read.codes.length;
    let start = 1;
    let bestDist = Infinity;
    for (let d = 1; d + k - 1 <= dayCount; d++) {
      const mid = (columnX(header, d) + columnX(header, d + k - 1)) / 2;
      if (Math.abs(mid - w.cx) < bestDist) {
        bestDist = Math.abs(mid - w.cx);
        start = d;
      }
    }
    if (bestDist > 0.75 * header.pitch) continue;
    read.codes.forEach((code, i) => {
      const cx = columnX(header, start + i);
      add(start + i, { code, off: 0, cx, sure: read.sure, raw: code, x0: cx, x1: cx });
    });
  }

  // Un código partido en dos trozos pegados («M» + «B», o «M» + «8»).
  for (const [d, l] of cands) {
    if (l.length !== 2) continue;
    const [a, b] = [...l].sort((p, q) => p.cx - q.cx);
    if (b.x0 - a.x1 > 0.25 * header.pitch) continue;
    const m = matchKnown(a.raw + b.raw, known);
    if (m.length === 1) cands.set(d, [{ ...a, code: m[0], raw: m[0], x1: b.x1, off: 0, sure: true, weak: false }]);
  }
  for (const [d, l] of cands) {
    const strong = l.filter((c) => !c.weak);
    if (strong.length === 0) cands.delete(d);
    else cands.set(d, strong);
  }

  // Dos lecturas en la misma columna: una suele pertenecer a la columna vecina vacía.
  for (let d = 1; d <= dayCount; d++) {
    const l = cands.get(d);
    if (!l || l.length < 2) continue;
    for (const c of [...l].sort((a, b) => Math.abs(b.off) - Math.abs(a.off))) {
      if (l.length < 2 || Math.abs(c.off) < 0.2 * header.pitch) break;
      const to = d + Math.sign(c.off);
      if (to < 1 || to > dayCount || cands.has(to)) continue;
      l.splice(l.indexOf(c), 1);
      add(to, { ...c, off: c.cx - columnX(header, to) });
    }
  }

  const cells = new Map<number, { code: string; sure: boolean }>();
  for (const [d, l] of cands) {
    if (l.every((c) => c.code === l[0].code)) {
      cells.set(d, { code: l[0].code, sure: l.every((c) => c.sure) });
      continue;
    }
    const nearest = [...l].sort((a, b) => Math.abs(a.off) - Math.abs(b.off))[0];
    cells.set(d, { code: nearest.code, sure: false });
  }

  // Código de día libre de esta fila: el más repetido entre los que no llevan horas debajo.
  const tally = new Map<string, { bare: number; withHours: number }>();
  for (const [d, c] of cells) {
    const t = tally.get(c.code) ?? { bare: 0, withHours: 0 };
    if (hours.has(d)) t.withHours++;
    else t.bare++;
    tally.set(c.code, t);
  }
  let rest: string | null = null;
  for (const [code, t] of tally) {
    if (t.bare >= 3 && t.withHours === 0 && (rest == null || t.bare > tally.get(rest)!.bare)) rest = code;
  }
  const worked = [...cells].filter(([, c]) => c.code !== rest);
  const hoursReliable = worked.length >= 5 && worked.filter(([d]) => hours.has(d)).length >= 0.8 * worked.length;

  // La posición de una columna sin número leído es fiable si tiene vecinas leídas cerca.
  const known_days = [...header.columns.keys()];
  const columnDoubt = (d: number) => {
    if (header.columns.has(d)) return false;
    const lo = Math.max(...known_days.filter((k) => k < d), -Infinity);
    const hi = Math.min(...known_days.filter((k) => k > d), Infinity);
    if (Number.isFinite(lo) && Number.isFinite(hi)) return hi - lo > 4;
    return Math.min(d - lo, hi - d) > 2;
  };

  const days: ExtractedDay[] = [];
  for (let d = 1; d <= dayCount; d++) {
    const c = cells.get(d);
    const hv = hours.get(d)?.v ?? null;
    // Celda sin leer y sin horas debajo: casi seguro un día libre; se propone, pero para confirmar.
    const guess = !c && hv == null && rest && hoursReliable ? rest : null;
    days.push({
      day: d,
      code: c ? c.code : guess,
      hours: hv,
      // El OCR no distingue el sombreado de los festivos.
      holiday: false,
      uncertain: !c || !c.sure || columnDoubt(d) || (hoursReliable && c.code === rest && hv != null),
    });
  }
  return { month, year: null, firstWeekday, days, summary: null };
}

const TIME_LINE =
  /(\d{1,2})[:.](\d{2})\s*h?\s*a\s*((?:\d{1,2}[:.]\d{2}\s*h?\s*\/?\s*)+)\s*en\s+(.+)$/i;

/** Lee la leyenda de horarios: líneas del tipo «10:00h a 14:00h en COLÓN». */
export function parseLegend(words: W[], byLine: Map<number, W[]>): ExtractedLegendEntry[] {
  interface LegendLine {
    x0: number;
    x1: number;
    cy: number;
    h: number;
    ids: Set<W>;
    start: string;
    ends: string[];
    location: string;
    inlineCode: string | null;
  }
  const lines: LegendLine[] = [];
  for (const ws of byLine.values()) {
    const sorted = [...ws].sort((a, b) => a.x - b.x);
    const text = sorted.map((w) => w.text).join(' ');
    const m = text.match(TIME_LINE);
    if (!m) continue;
    const ends = [...m[3].matchAll(/(\d{1,2})[:.](\d{2})/g)].map((e) => `${e[1].padStart(2, '0')}:${e[2]}`);
    // Quita del lugar la columna de horas («8H», «6H/7H») si el OCR la unió a la línea.
    const location = m[4].replace(/\s+\d[\dH/,.\s]*H?\s*$/i, '').trim();
    const before = text.slice(0, m.index).trim();
    const inline = normText(before);
    lines.push({
      x0: sorted[0].x,
      x1: sorted[sorted.length - 1].x + sorted[sorted.length - 1].w,
      cy: median(sorted.map((w) => w.cy)),
      h: median(sorted.map((w) => w.h)),
      ids: new Set(sorted),
      start: `${m[1].padStart(2, '0')}:${m[2]}`,
      ends,
      location,
      inlineCode: /^[A-Z][A-Z0-9]{0,3}$/.test(inline) ? inline : null,
    });
  }
  lines.sort((a, b) => a.cy - b.cy);

  const entries: (ExtractedLegendEntry & { last: LegendLine })[] = [];
  for (const line of lines) {
    let code = line.inlineCode;
    if (!code) {
      // Etiqueta del código: palabra corta a la izquierda, a la misma altura.
      let best: { w: W; dist: number } | null = null;
      for (const w of words) {
        if (line.ids.has(w) || !isCode(w)) continue;
        if (Math.abs(w.cy - line.cy) > 0.6 * line.h) continue;
        const dist = line.x0 - (w.x + w.w);
        if (dist < 0 || dist > 12 * line.h) continue;
        if (!best || dist < best.dist) best = { w, dist };
      }
      code = best?.w.norm ?? null;
    }
    const segment = { start: line.start, endOptions: line.ends, location: line.location || null };
    if (code) {
      entries.push({ code, title: null, segments: [segment], last: line });
      continue;
    }
    // Sin etiqueta: es el segundo tramo de la entrada que tiene justo encima.
    const parent = [...entries]
      .reverse()
      .find((e) => line.cy - e.last.cy > 0 && line.cy - e.last.cy < 2.4 * line.h && line.x0 < e.last.x1 && line.x1 > e.last.x0);
    if (parent) {
      parent.segments.push(segment);
      parent.last = line;
    }
  }
  return entries.map(({ last: _last, ...e }) => e);
}

export interface OcrCornerWord {
  text: string;
  /** Esquinas en el orden del texto: arriba-izquierda, arriba-derecha, abajo-derecha, abajo-izquierda. */
  corners: readonly { x: number; y: number }[];
  line: number;
}

/**
 * Endereza la lectura: las fotos suelen llegar giradas (móvil en vertical, hoja apaisada) y el
 * OCR devuelve entonces el texto «de lado». Con las esquinas de cada palabra se calcula hacia
 * dónde corre el texto y se giran todas las posiciones para que las filas queden horizontales.
 */
export function wordsFromCorners(items: OcrCornerWord[]): OcrWord[] {
  let sx = 0;
  let sy = 0;
  for (const it of items) {
    if (it.corners.length < 4) continue;
    const dx = it.corners[1].x - it.corners[0].x;
    const dy = it.corners[1].y - it.corners[0].y;
    // Las palabras largas dan una dirección más fiable.
    sx += dx;
    sy += dy;
  }
  const angle = Math.atan2(sy, sx);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const out: OcrWord[] = [];
  for (const it of items) {
    if (it.corners.length < 4) continue;
    const [a, b, , d] = it.corners;
    const cx = it.corners.reduce((s, p) => s + p.x, 0) / it.corners.length;
    const cy = it.corners.reduce((s, p) => s + p.y, 0) / it.corners.length;
    const w = Math.hypot(b.x - a.x, b.y - a.y);
    const h = Math.hypot(d.x - a.x, d.y - a.y);
    const rx = cx * cos + cy * sin;
    const ry = -cx * sin + cy * cos;
    out.push({ text: it.text, x: rx - w / 2, y: ry - h / 2, w, h, line: it.line });
  }
  return out;
}

/**
 * Nombres de las filas de la cartelera: palabras a la izquierda del día 1 cuya fila contiene
 * de verdad una serie de códigos. Sirve para que cada persona elija cuál es la suya.
 */
function findPeople(words: W[], byLine: Map<number, W[]>, known: Set<string>, now: Date): string[] {
  const seen = new Map<string, { text: string; cy: number }>();
  for (const w of words) {
    if (!/^[A-Z]{3,}$/.test(w.norm) || /\d/.test(w.text)) continue;
    if (monthOf(w.norm) || known.has(w.norm) || w.norm.startsWith('HORA') || seen.has(w.norm)) continue;
    const header = findHeader(words, w);
    if (!header || Math.min(...header.columns.keys()) > 4) continue;
    if (columnX(header, 1) - 0.4 * header.pitch < w.x + w.w) continue;
    const table = parseTable(words, byLine, w, now, [], known);
    if (!table || table.days.filter((d) => d.code && !d.uncertain).length < 10) continue;
    seen.set(w.norm, { text: w.text.trim(), cy: w.cy });
  }
  return [...seen.values()].sort((a, b) => a.cy - b.cy).map((p) => p.text);
}

export function parseBoardFromWords(
  rawWords: OcrWord[],
  employeeName: string,
  now = new Date(),
  /** Códigos del diccionario del usuario: permiten corregir confusiones y separar celdas unidas. */
  knownCodes: readonly string[] = [],
): BoardExtraction {
  const words: W[] = rawWords
    .filter((w) => w.text.trim() && w.h > 0 && w.w > 0)
    .map((w) => ({ ...w, cx: w.x + w.w / 2, cy: w.y + w.h / 2, norm: normText(w.text) }));
  const byLine = new Map<number, W[]>();
  for (const w of words) {
    const l = byLine.get(w.line);
    if (l) l.push(w);
    else byLine.set(w.line, [w]);
  }

  const target = normText(employeeName);
  const anchors = words.filter((w) => w.norm === target).sort((a, b) => a.cy - b.cy);
  const warnings: string[] = [];
  const months: ExtractedMonth[] = [];

  const legend = parseLegend(words, byLine);
  const known = new Set([...knownCodes, ...legend.map((l) => l.code)].map(normText).filter(Boolean));

  for (const anchor of anchors) {
    const table = parseTable(words, byLine, anchor, now, warnings, known);
    if (!table) continue;
    if (months.some((m) => m.month === table.month)) continue;
    months.push(table);
  }
  if (months.length > 0) {
    warnings.push('El OCR del teléfono no detecta los festivos sombreados ni el resumen de horas: revísalos a mano.');
  }

  return {
    engine: 'local',
    employeeName,
    employeeFound: anchors.length > 0,
    months,
    legend,
    warnings,
    people: findPeople(words, byLine, known, now),
  };
}
