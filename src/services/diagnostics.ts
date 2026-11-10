import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { BoardExtraction } from '../recognition/types';

/**
 * Comparte lo que leyó el OCR (texto y posición de cada palabra) junto con el resultado, para
 * poder afinar el lector cuando una cartelera no se lee bien. Solo se envía si el usuario lo pide.
 */
export async function shareDiagnostics(extraction: BoardExtraction): Promise<void> {
  const { debug, ...result } = extraction;
  const json = JSON.stringify({ format: 'mi-turno-diagnostico', result, words: debug ? JSON.parse(debug) : [] });
  if (Platform.OS === 'web') return;
  const file = new File(Paths.cache, 'mi-turno-diagnostico.json');
  if (file.exists) file.delete();
  file.create();
  file.write(json);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Enviar diagnóstico de lectura' });
}
