import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'anthropic_api_key';

/**
 * La clave de API se guarda en el almacén seguro del sistema (Keychain / Keystore),
 * fuera de la base de datos y de las copias de seguridad.
 */
export async function getApiKey(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(KEY) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(KEY);
}

export async function setApiKey(value: string | null): Promise<void> {
  const v = value?.trim();
  if (Platform.OS === 'web') {
    try {
      if (v) globalThis.localStorage?.setItem(KEY, v);
      else globalThis.localStorage?.removeItem(KEY);
    } catch {
      // Sin almacenamiento disponible: la clave no se conserva.
    }
    return;
  }
  if (v) await SecureStore.setItemAsync(KEY, v);
  else await SecureStore.deleteItemAsync(KEY);
}
