import type AnthropicClient from '@anthropic-ai/sdk';
import { Platform } from 'react-native';
import { z } from 'zod';

import { WEEKDAY_LETTERS } from '../domain/time';
import { imageToBase64Jpeg } from '../services/images';
import { getApiKey } from '../services/secrets';
import { RecognitionError, type BoardExtraction, type Recognizer, type RecognizerInput } from './types';

const MODEL = 'claude-opus-5-5';

// El SDK se carga solo cuando hace falta: así la app arranca aunque no se use la IA.
const loadSdk = () => require('@anthropic-ai/sdk').default as typeof AnthropicClient;
const loadZodHelper = () =>
  require('@anthropic-ai/sdk/helpers/beta/zod') as typeof import('@anthropic-ai/sdk/helpers/beta/zod');

const nullableNumber = z.number().nullable();

const BoardSchema = z.object({
  employee_found: z.boolean().describe('true only if a row labelled with the requested employee name exists'),
  months: z.array(
    z.object({
      month: z.number().describe('Month number 1-12 of this table'),
      year: z.number().nullable().describe('Year only if it is printed on the sheet, otherwise null'),
      first_day_weekday: z
        .enum(['L', 'M', 'X', 'J', 'V', 'S', 'D'])
        .nullable()
        .describe('Weekday letter printed above day 1 in the header (Spanish: L M X J V S D)'),
      days: z.array(
        z.object({
          day: z.number().describe('Day of the month from the header row'),
          code: z.string().nullable().describe('Shift code in the employee row for this day, null if unreadable'),
          hours: nullableNumber.describe('Small number printed under the code (hours that day), null if none'),
          holiday: z.boolean().describe('true if this day column is highlighted/shaded as a holiday'),
          uncertain: z.boolean().describe('true if you are not confident about the code or hours of this cell'),
        }),
      ),
      summary: z
        .object({
          horas_a_compensar: nullableNumber,
          horas_trabajadas: nullableNumber,
          total_horas_trabajadas: nullableNumber,
          horas_pendientes: nullableNumber,
        })
        .nullable()
        .describe('Values of the summary columns on the employee row, null if the sheet has none'),
    }),
  ),
  legend: z.array(
    z.object({
      code: z.string(),
      title: z.string().nullable().describe('Heading that applies to this code, if any'),
      segments: z.array(
        z.object({
          start: z.string().describe('Start time as HH:MM'),
          end_options: z.array(z.string()).describe('One HH:MM per alternative end time, in the printed order'),
          location: z.string().nullable(),
        }),
      ),
    }),
  ),
  warnings: z.array(z.string()).describe('Short notes in Spanish about anything unreadable or ambiguous'),
  people: z.array(z.string()).describe('Row labels (employee names) of the roster table exactly as printed, top to bottom, without duplicates'),
});

function buildPrompt(employeeName: string): string {
  return `This photo shows a printed monthly work roster ("cartelera") from a Spanish company. It may contain one or more month tables, a legend of shift codes, and parts of other sheets around it.

Transcribe ONLY the row of the employee labelled "${employeeName}". Other employees' rows exist only to help you keep your place; do not report them. Names such as "Alejandro" are different people from "Alex": match the label exactly, ignoring case and accents.

How the sheet is laid out:
- Each month table has a title (e.g. NOVIEMBRE), a header row of weekday letters (L M X J V S D) and, under it, a header row with the day numbers 1..31.
- Each employee row has two lines per day: a shift code (letters, e.g. M, MB, T, TA, CS, VCS, FS, MT, HE, D) and, below it, a small number that is the HOURS worked that day (typically 4-8). Those small numbers are never day numbers; day numbers come only from the header row. Rest days ("D") usually have no number.
- Some day columns are shaded dark: those are holidays. Shaded cells still contain a code; read it.
- To the right of each table there may be summary columns (Horas a compensar, Horas trabajadas, Total horas trabajadas, Horas pendientes).
- A legend block lists what each code means: start time, end time(s) and workplace. A code may span two lines (a split shift with two segments). An end time written like 21:00/22:00/23:00 means alternative end times: return each one in end_options.

Accuracy matters more than completeness. This is someone's actual work schedule:
- Work column by column. For every day number in the header, find the cell of the "${employeeName}" row directly beneath it. Return exactly one entry per day in the header, in order.
- Never guess. If a cell is blurred, cut off, or you cannot tell which column it belongs to, set code to null (or your best reading) and uncertain to true.
- Copy codes exactly as printed. Do not replace a code with a similar one and do not infer codes from other employees or from patterns.
- As a self-check, if the summary shows "Horas trabajadas" for this row, the per-day hours you read should add up to it. If they do not, re-read the row; if they still do not, say so in warnings.
- Transcribe the legend exactly as printed. Do not add codes that are not in the legend and do not invent times.
- Ignore partially visible tables from other sheets unless the "${employeeName}" row and the day header are both fully readable.

If there is no row for "${employeeName}", set employee_found to false and return empty months.

Always fill "people" with the names that label the rows of the table (every employee, not just the requested one), even when the requested row is missing.`;
}

function createClient(apiKey: string): AnthropicClient {
  const Anthropic = loadSdk();
  // En nativo, expo/fetch es la implementación de fetch compatible con el estándar.
  const fetchImpl = Platform.OS === 'web' ? undefined : (require('expo/fetch').fetch as typeof fetch);
  return new Anthropic({
    apiKey,
    fetch: fetchImpl,
    // La clave es del propio usuario y solo vive en su dispositivo.
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
    timeout: 5 * 60 * 1000,
  });
}

function explainError(error: unknown): string {
  const Anthropic = loadSdk();
  if (error instanceof Anthropic.AuthenticationError) {
    return 'La clave de API no es válida. Revísala en Ajustes.';
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return 'Tu clave de API no tiene permiso para usar este modelo.';
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'Has alcanzado el límite de uso de la API. Inténtalo de nuevo en unos minutos.';
  }
  if (error instanceof Anthropic.BadRequestError) {
    return `La API ha rechazado la petición: ${error.message}`;
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return 'No se ha podido conectar con el servicio de IA. Comprueba tu conexión a internet.';
  }
  if (error instanceof Anthropic.APIError) {
    return `Error del servicio de IA (${error.status ?? 'sin código'}). Inténtalo de nuevo.`;
  }
  return error instanceof Error ? error.message : 'Error desconocido al analizar la imagen.';
}

export const claudeRecognizer: Recognizer = {
  id: 'claude',

  async unavailableReason() {
    return (await getApiKey()) ? null : 'Falta la clave de API de Anthropic (Ajustes → Reconocimiento).';
  },

  async recognize(input: RecognizerInput): Promise<BoardExtraction> {
    const apiKey = await getApiKey();
    if (!apiKey) throw new RecognitionError('Falta la clave de API de Anthropic.');
    const data = await imageToBase64Jpeg(input);
    const client = createClient(apiKey);
    const { betaZodOutputFormat } = loadZodHelper();

    let response;
    try {
      response = await client.beta.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        // Si el modelo declina la petición, la API la reintenta en el modelo alternativo por defecto.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high', format: betaZodOutputFormat(BoardSchema) },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
              { type: 'text', text: buildPrompt(input.employeeName) },
            ],
          },
        ],
      });
    } catch (error) {
      throw new RecognitionError(explainError(error));
    }

    if (response.stop_reason === 'refusal') {
      throw new RecognitionError('El servicio de IA no ha querido analizar esta imagen.');
    }
    if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
      throw new RecognitionError('La respuesta de la IA ha llegado incompleta. Inténtalo de nuevo.');
    }
    const out = response.parsed_output;

    return {
      engine: 'claude',
      employeeName: input.employeeName,
      employeeFound: out.employee_found,
      warnings: out.warnings,
      people: out.people.map((p) => p.trim()).filter(Boolean),
      months: out.months.map((m) => ({
        month: Math.round(m.month),
        year: m.year == null ? null : Math.round(m.year),
        firstWeekday: m.first_day_weekday ? WEEKDAY_LETTERS.indexOf(m.first_day_weekday) : null,
        days: m.days.map((d) => ({ ...d, day: Math.round(d.day), code: d.code?.trim() || null })),
        summary: m.summary && {
          compensationHours: m.summary.horas_a_compensar,
          workedHours: m.summary.horas_trabajadas,
          totalWorkedHours: m.summary.total_horas_trabajadas,
          pendingHours: m.summary.horas_pendientes,
        },
      })),
      legend: out.legend.map((l) => ({
        code: l.code,
        title: l.title,
        segments: l.segments.map((s) => ({ start: s.start, endOptions: s.end_options, location: s.location })),
      })),
    };
  },
};
