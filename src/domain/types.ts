/** Tipos de dominio compartidos por reconocimiento, interpretación y calendario. */

export type ShiftType = 'morning' | 'afternoon' | 'night' | 'split' | 'off' | 'other';

/** Tramo de trabajo. Horas en formato "HH:MM". Si end <= start, termina al día siguiente. */
export interface Segment {
  start: string;
  end: string;
  location?: string;
}

export type CodeSource = 'initial' | 'legend' | 'user';

/** Entrada del diccionario de códigos de turno. */
export interface CodeDef {
  code: string;
  label: string;
  type: ShiftType;
  segments: Segment[];
  /**
   * Horas de salida alternativas del ÚLTIMO tramo (p. ej. T: 21:00 / 22:00 / 23:00).
   * La variante se elige con el número de horas que aparece bajo el código.
   */
  endOptions?: string[];
  source: CodeSource;
  updatedAt: string;
}

export interface Shift {
  /** YYYY-MM-DD */
  date: string;
  /** Código original de la cartelera (o el que escriba el usuario). */
  code: string;
  type: ShiftType;
  segments: Segment[];
  hours: number;
  isHoliday: boolean;
  notes: string;
  boardId: string | null;
  /** true si el usuario lo creó o modificó a mano. */
  manual: boolean;
}

export type BoardStatus = 'pending' | 'reviewed';

export interface Board {
  id: string;
  imageUri: string | null;
  /** Meses que cubre, como "YYYY-MM". */
  months: string[];
  importedAt: string;
  status: BoardStatus;
  engine: string;
  shiftCount: number;
  /** Resultado bruto del reconocimiento, para poder volver a revisarlo. */
  extraction: import('../recognition/types').BoardExtraction;
}

/** Cifras mensuales que vienen de la cartelera o que el usuario introduce a mano. */
export interface MonthFigures {
  /** YYYY-MM */
  month: string;
  pendingHours: number | null;
  compensationHours: number | null;
  totalWorkedHours: number | null;
}

/** Calendario que otra persona ha compartido contigo. Solo se consulta: no se mezcla con tus turnos. */
export interface SharedCalendar {
  id: string;
  name: string;
  receivedAt: string;
  shifts: Shift[];
  codes: CodeDef[];
  /** Canal por el que se mantiene al día solo (si quien lo compartió tiene la sincronización activa). */
  channel?: string;
  version?: number;
  rev?: string;
}

export type EnginePref = 'auto' | 'claude' | 'local';
export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  employeeName: string;
  /** El usuario ya ha elegido (o escrito) cuál es su fila de la cartelera. */
  nameChosen: boolean;
  engine: EnginePref;
  theme: ThemePref;
  notifyBefore: boolean;
  notifyBeforeMinutes: number;
  notifyAtStart: boolean;
  notifyNextShift: boolean;
  notifyDailySummary: boolean;
  dailySummaryHour: number;
  notifyNewBoard: boolean;
  newBoardDay: number;
  /** Dirección del servicio de intercambio (compartir con código). Vacío = el de la app. */
  relayUrl: string;
  /** Android: al pulsar atrás en la pantalla principal, preguntar antes de salir. */
  confirmExit: boolean;
  /** Enlace de sincronización continua con otros teléfonos; null si no se ha compartido nada. */
  sync: import('./sync').SyncLink | null;
}

export const DEFAULT_SETTINGS: Settings = {
  employeeName: '',
  nameChosen: false,
  engine: 'auto',
  theme: 'system',
  notifyBefore: true,
  notifyBeforeMinutes: 60,
  notifyAtStart: false,
  notifyNextShift: false,
  notifyDailySummary: true,
  dailySummaryHour: 20,
  notifyNewBoard: false,
  newBoardDay: 25,
  relayUrl: '',
  confirmExit: true,
  sync: null,
};
