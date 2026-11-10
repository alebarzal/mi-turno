/**
 * Contrato entre los motores de reconocimiento (IA de visión, OCR local…) y la
 * capa de interpretación. Un motor solo LEE la imagen: no decide horarios.
 */

export interface ExtractedDay {
  day: number;
  /** Código tal cual aparece en la fila del trabajador (p. ej. "CS", "D"). null si no se pudo leer. */
  code: string | null;
  /** Número pequeño bajo el código (horas de ese día). null si no hay. */
  hours: number | null;
  /** La columna del día está resaltada como festivo. */
  holiday: boolean;
  /** El motor no está seguro de la lectura de esta celda. */
  uncertain: boolean;
}

export interface ExtractedSummary {
  compensationHours: number | null;
  workedHours: number | null;
  totalWorkedHours: number | null;
  pendingHours: number | null;
}

export interface ExtractedMonth {
  /** 1–12 */
  month: number;
  /** Año impreso en la cartelera, si aparece. */
  year: number | null;
  /** Día de la semana del día 1 según la cabecera: 0 = lunes … 6 = domingo. */
  firstWeekday: number | null;
  days: ExtractedDay[];
  summary: ExtractedSummary | null;
}

export interface ExtractedLegendSegment {
  start: string;
  /** Una o varias horas de salida posibles ("21:00/22:00/23:00"). */
  endOptions: string[];
  location: string | null;
}

export interface ExtractedLegendEntry {
  code: string;
  title: string | null;
  segments: ExtractedLegendSegment[];
}

export interface BoardExtraction {
  engine: 'claude' | 'local';
  employeeName: string;
  employeeFound: boolean;
  months: ExtractedMonth[];
  legend: ExtractedLegendEntry[];
  warnings: string[];
  /** Nombres de todas las filas de la cartelera, para que el usuario elija la suya. */
  people?: string[];
  /** Lectura en bruto del OCR (palabras y posiciones), para poder diagnosticar fallos. */
  debug?: string;
}

export interface RecognizerInput {
  /** URI local de la imagen. */
  uri: string;
  employeeName: string;
  /** Códigos que ya conoce el diccionario del usuario. */
  knownCodes?: readonly string[];
}

export interface Recognizer {
  id: 'claude' | 'local';
  /** null si está disponible; si no, el motivo en lenguaje llano. */
  unavailableReason(): Promise<string | null>;
  recognize(input: RecognizerInput): Promise<BoardExtraction>;
}

export class RecognitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecognitionError';
  }
}
