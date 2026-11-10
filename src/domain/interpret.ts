import type { BoardExtraction } from '../recognition/types';
import { codeVariants, mergeLegend, normalizeCode, type Dictionary } from './codes';
import { inferYear, makeYmd, daysInMonth } from './time';
import type { CodeDef, MonthFigures, Shift } from './types';

export type IssueKind =
  /** El código no está en el diccionario ni en la leyenda: hay que confirmarlo. */
  | 'unknown_code'
  /** Las horas de la cartelera no coinciden con ninguna variante del código. */
  | 'hours_mismatch'
  /** El código tiene varias salidas posibles y la cartelera no indica las horas. */
  | 'ambiguous_variant'
  /** El motor no estaba seguro de la lectura. */
  | 'uncertain_read'
  /** No se leyó nada para ese día. */
  | 'missing';

export const ISSUE_TEXT: Record<IssueKind, string> = {
  unknown_code: 'Código desconocido: confirma su horario',
  hours_mismatch: 'Las horas de la cartelera no cuadran con el horario del código',
  ambiguous_variant: 'Este código tiene varias horas de salida: elige una',
  uncertain_read: 'Lectura dudosa: compruébala en la foto',
  missing: 'No se ha podido leer este día',
};

/** Incidencias que impiden guardar el día tal cual. */
export const BLOCKING: IssueKind[] = ['unknown_code', 'missing'];

export interface DraftShift extends Shift {
  issues: IssueKind[];
  /** Horas que indica la cartelera bajo el código. */
  statedHours: number | null;
}

export interface DraftMonth {
  /** YYYY-MM */
  month: string;
  statedTotal: number | null;
  computedTotal: number;
  figures: MonthFigures;
}

export interface Interpretation {
  drafts: DraftShift[];
  months: DraftMonth[];
  /** Códigos nuevos o actualizados a partir de la leyenda de la imagen. */
  legendCodes: CodeDef[];
  dict: Dictionary;
}

/** Convierte un código + horas indicadas en un turno concreto, sin inventar nada. */
export function resolveShift(
  date: string,
  rawCode: string | null,
  statedHours: number | null,
  dict: Dictionary,
  extra: { holiday?: boolean; uncertain?: boolean; boardId?: string | null } = {},
): DraftShift {
  const base: DraftShift = {
    date,
    code: rawCode ? normalizeCode(rawCode) : '',
    type: 'other',
    segments: [],
    hours: statedHours ?? 0,
    isHoliday: extra.holiday ?? false,
    notes: '',
    boardId: extra.boardId ?? null,
    manual: false,
    issues: [],
    statedHours,
  };
  if (!base.code) {
    base.issues.push('missing');
    return base;
  }
  if (extra.uncertain) base.issues.push('uncertain_read');

  const def = dict[base.code];
  if (!def) {
    base.issues.push('unknown_code');
    return base;
  }
  base.type = def.type;

  const variants = codeVariants(def);
  if (def.segments.length === 0) {
    // Descanso u otro día sin horario.
    base.hours = statedHours ?? 0;
    return base;
  }
  if (statedHours != null) {
    const match = variants.find((v) => Math.abs(v.hours - statedHours) < 0.01);
    if (match) {
      base.segments = match.segments;
      base.hours = match.hours;
    } else {
      // Se respetan las horas de la cartelera, pero se pide revisar el horario.
      base.segments = variants[0].segments;
      base.hours = statedHours;
      base.issues.push('hours_mismatch');
    }
  } else {
    base.segments = variants[0].segments;
    base.hours = variants[0].hours;
    if (variants.length > 1) base.issues.push('ambiguous_variant');
  }
  return base;
}

/** Interpreta una cartelera leída: asocia cada día a su fecha y cada código a su horario. */
export function interpretBoard(
  extraction: BoardExtraction,
  storedDict: Dictionary,
  opts: { now?: Date; boardId?: string | null } = {},
): Interpretation {
  const now = opts.now ?? new Date();
  // Una lectura por OCR local es menos fiable: su leyenda solo rellena huecos.
  const policy = extraction.engine === 'local' ? 'fill' : 'override';
  const { dict, changed } = mergeLegend(storedDict, extraction.legend, policy, now.toISOString());

  const drafts: DraftShift[] = [];
  const months: DraftMonth[] = [];

  for (const m of extraction.months) {
    if (m.month < 1 || m.month > 12) continue;
    const year = m.year ?? inferYear(m.month, m.firstWeekday, now);
    const ym = makeYmd(year, m.month, 1).slice(0, 7);
    const total = daysInMonth(ym);
    const byDay = new Map(m.days.filter((d) => d.day >= 1 && d.day <= total).map((d) => [d.day, d]));
    let computed = 0;
    for (let day = 1; day <= total; day++) {
      const d = byDay.get(day);
      const draft = resolveShift(makeYmd(year, m.month, day), d?.code ?? null, d?.hours ?? null, dict, {
        holiday: d?.holiday,
        uncertain: d?.uncertain,
        boardId: opts.boardId,
      });
      computed += draft.hours;
      drafts.push(draft);
    }
    months.push({
      month: ym,
      statedTotal: m.summary?.workedHours ?? null,
      computedTotal: Math.round(computed * 100) / 100,
      figures: {
        month: ym,
        pendingHours: m.summary?.pendingHours ?? null,
        compensationHours: m.summary?.compensationHours ?? null,
        totalWorkedHours: m.summary?.totalWorkedHours ?? null,
      },
    });
  }
  drafts.sort((a, b) => a.date.localeCompare(b.date));
  return { drafts, months, legendCodes: changed, dict };
}

export const isBlocked = (d: DraftShift) => d.issues.some((i) => BLOCKING.includes(i));

export function draftToShift(d: DraftShift): Shift {
  const { issues: _i, statedHours: _s, ...shift } = d;
  return shift;
}
