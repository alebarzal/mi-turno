import { NativeModules, Platform } from 'react-native';

import { parseBoardFromWords, wordsFromCorners, type OcrCornerWord, type OcrWord } from './tableParser';
import { RecognitionError, type BoardExtraction, type Recognizer, type RecognizerInput } from './types';

/**
 * OCR en el propio teléfono con Google ML Kit. La imagen no sale del dispositivo.
 * Necesita una compilación nativa de la app (no funciona en Expo Go ni en la web).
 */
const hasNativeModule = () => Platform.OS !== 'web' && !!NativeModules.TextRecognition;

export const localRecognizer: Recognizer = {
  id: 'local',

  async unavailableReason() {
    return hasNativeModule()
      ? null
      : 'El OCR del teléfono solo está disponible en la app instalada (no en Expo Go ni en la web).';
  },

  async recognize(input: RecognizerInput): Promise<BoardExtraction> {
    if (!hasNativeModule()) throw new RecognitionError('El OCR del teléfono no está disponible en esta versión.');
    // Se carga bajo demanda para no romper Expo Go ni la web.
    const TextRecognition = require('@react-native-ml-kit/text-recognition')
      .default as typeof import('@react-native-ml-kit/text-recognition').default;

    let result;
    try {
      result = await TextRecognition.recognize(input.uri);
    } catch (e) {
      throw new RecognitionError(`El OCR no ha podido leer la imagen${e instanceof Error ? `: ${e.message}` : '.'}`);
    }

    const framed: OcrWord[] = [];
    const cornered: OcrCornerWord[] = [];
    let line = 0;
    let total = 0;
    for (const block of result.blocks) {
      for (const l of block.lines) {
        line++;
        for (const el of l.elements) {
          total++;
          if (el.cornerPoints?.length === 4) cornered.push({ text: el.text, corners: el.cornerPoints, line });
          if (el.frame) {
            framed.push({ text: el.text, x: el.frame.left, y: el.frame.top, w: el.frame.width, h: el.frame.height, line });
          }
        }
      }
    }
    // Con las esquinas se puede enderezar una foto girada; sin ellas se usan los recuadros tal cual.
    const useCorners = cornered.length >= framed.length * 0.8 && cornered.length > 0;
    const now = new Date();
    const known = input.knownCodes ?? [];
    let used = useCorners ? wordsFromCorners(cornered) : framed;
    let out = parseBoardFromWords(used, input.employeeName, now, known);
    // Último recurso: suponer que el texto corre hacia abajo, al revés o hacia arriba.
    for (let turn = 1; turn < 4 && out.months.length === 0; turn++) {
      const turned: OcrCornerWord[] = framed.map((f) => {
        const box = [
          { x: f.x, y: f.y },
          { x: f.x + f.w, y: f.y },
          { x: f.x + f.w, y: f.y + f.h },
          { x: f.x, y: f.y + f.h },
        ];
        return { text: f.text, line: f.line, corners: [0, 1, 2, 3].map((i) => box[(i + turn) % 4]) };
      });
      const words = wordsFromCorners(turned);
      const attempt = parseBoardFromWords(words, input.employeeName, now, known);
      if (attempt.months.length > 0) {
        out = attempt;
        used = words;
      }
    }
    if (out.months.length === 0) {
      out.warnings.push(`Diagnóstico: ${total} palabras leídas, ${useCorners ? 'con' : 'sin'} corrección de giro.`);
    }
    out.debug = JSON.stringify(used.map((w) => [w.text, Math.round(w.x), Math.round(w.y), Math.round(w.w), Math.round(w.h), w.line]));
    return out;
  },
};
