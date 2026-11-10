import type { EnginePref } from '../domain/types';
import { claudeRecognizer } from './claudeVision';
import { localRecognizer } from './localOcr';
import { RecognitionError, type BoardExtraction, type Recognizer, type RecognizerInput } from './types';

export * from './types';

const ENGINES: Record<'claude' | 'local', Recognizer> = { claude: claudeRecognizer, local: localRecognizer };

export const ENGINE_NAMES: Record<BoardExtraction['engine'], string> = {
  claude: 'IA de visión (Claude)',
  local: 'OCR del teléfono',
};

export interface EngineStatus {
  id: 'claude' | 'local';
  unavailableReason: string | null;
}

export async function engineStatuses(): Promise<EngineStatus[]> {
  return Promise.all(
    (['claude', 'local'] as const).map(async (id) => ({ id, unavailableReason: await ENGINES[id].unavailableReason() })),
  );
}

/**
 * Lee una cartelera con el motor preferido.
 * En modo automático se usa la IA de visión si hay clave; si no (o si falla), el OCR del teléfono.
 */
export async function recognizeBoard(
  input: RecognizerInput,
  pref: EnginePref,
  onEngine?: (id: 'claude' | 'local') => void,
): Promise<BoardExtraction> {
  const order: ('claude' | 'local')[] = pref === 'auto' ? ['claude', 'local'] : [pref];
  const problems: string[] = [];
  for (const id of order) {
    const engine = ENGINES[id];
    const reason = await engine.unavailableReason();
    if (reason) {
      problems.push(reason);
      continue;
    }
    onEngine?.(id);
    try {
      return await engine.recognize(input);
    } catch (e) {
      problems.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new RecognitionError(problems.join('\n'));
}
