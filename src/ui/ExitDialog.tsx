import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button, T, Tap } from './kit';
import { radius, space, useTheme } from './theme';

/** Pregunta si se quiere salir de la app, con la opción de no volver a preguntarlo. */
export function ExitDialog({
  visible,
  onCancel,
  onExit,
}: {
  visible: boolean;
  onCancel: () => void;
  onExit: (dontAskAgain: boolean) => void;
}) {
  const t = useTheme();
  const [dontAsk, setDontAsk] = useState(false);
  useEffect(() => {
    if (visible) setDontAsk(false);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: space.lg }}>
        <Pressable accessibilityLabel="Seguir en la app" style={[StyleSheet.absoluteFill, { backgroundColor: t.overlay }]} onPress={onCancel} />
        <View style={{ width: '100%', maxWidth: 380, backgroundColor: t.elevated, borderRadius: radius.xl, padding: space.lg, gap: space.md }}>
          <T v="heading">¿Salir de Mi Turno?</T>
          <T v="body" color={t.sub}>
            Tus turnos quedan guardados y los avisos seguirán llegando.
          </T>
          <Tap
            onPress={() => setDontAsk((v) => !v)}
            label="No volver a preguntar"
            scaleTo={0.98}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}
          >
            <View
              accessibilityRole="checkbox"
              accessibilityState={{ checked: dontAsk }}
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                borderWidth: 2,
                borderColor: dontAsk ? t.accent : t.faint,
                backgroundColor: dontAsk ? t.accent : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {dontAsk ? <Feather name="check" size={15} color={t.onAccent} /> : null}
            </View>
            <T v="body">No volver a preguntar</T>
          </Tap>
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xs }}>
            <Button title="Quedarme" kind="soft" onPress={onCancel} style={{ flex: 1 }} />
            <Button title="Salir" onPress={() => onExit(dontAsk)} style={{ flex: 1 }} />
          </View>
          {dontAsk ? (
            <T v="caption" style={{ textAlign: 'center' }}>Puedes volver a activarlo en Ajustes.</T>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
