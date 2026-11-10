import { Directory, File, Paths } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

export interface PickedImage {
  uri: string;
  width?: number;
  height?: number;
}

/** Lado largo máximo que se envía a la IA: suficiente para leer la letra pequeña de la tabla. */
const MAX_SIDE = 2400;

function resizeAction(img: PickedImage, maxSide: number) {
  if (!img.width || !img.height) return [];
  if (Math.max(img.width, img.height) <= maxSide) return [];
  return [{ resize: img.width >= img.height ? { width: maxSide } : { height: maxSide } }];
}

export async function imageToBase64Jpeg(img: PickedImage): Promise<string> {
  const out = await manipulateAsync(img.uri, resizeAction(img, MAX_SIDE), {
    compress: 0.9,
    format: SaveFormat.JPEG,
    base64: true,
  });
  if (!out.base64) throw new Error('No se ha podido preparar la imagen.');
  return out.base64;
}

/**
 * Guarda una copia privada de la foto de la cartelera dentro de la app, para el historial.
 * En la web no hay sistema de archivos: se guarda como data URI reducida.
 */
export async function persistBoardImage(img: PickedImage, id: string): Promise<string> {
  if (Platform.OS === 'web') {
    const out = await manipulateAsync(img.uri, resizeAction(img, 1600), {
      compress: 0.8,
      format: SaveFormat.JPEG,
      base64: true,
    });
    return `data:image/jpeg;base64,${out.base64}`;
  }
  const dir = new Directory(Paths.document, 'carteleras');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const out = await manipulateAsync(img.uri, [], { compress: 0.92, format: SaveFormat.JPEG });
  const dest = new File(dir, `${id}.jpg`);
  if (dest.exists) dest.delete();
  new File(out.uri).copy(dest);
  return dest.uri;
}

export function deleteBoardImage(uri: string | null): void {
  if (!uri || Platform.OS === 'web' || uri.startsWith('data:')) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Si la foto ya no existe no hay nada que borrar.
  }
}
