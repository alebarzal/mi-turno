import { Feather } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';

import type { Update } from '../services/updates';
import { Button, T } from './kit';
import { radius, space, useTheme } from './theme';

/** Aviso al abrir la app cuando GitHub tiene una versión más nueva. */
export function UpdateDialog({ update, onLater, onUpdate }: { update: Update | null; onLater: () => void; onUpdate: () => void }) {
  const t = useTheme();
  const pop = useRef(new Animated.Value(0)).current;
  const visible = !!update;

  useEffect(() => {
    if (!visible) return;
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 7 }).start();
  }, [visible, pop]);

  // El icono «respira» para llamar la atención sin molestar.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, pulse]);

  const day = update?.date ? new Date(update.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }) : '';
  const mb = update?.size ? `${Math.round(update.size / 1e6)} MB` : '';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onLater} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: space.lg }}>
        <Pressable accessibilityLabel="Más tarde" style={[StyleSheet.absoluteFill, { backgroundColor: t.overlay }]} onPress={onLater} />
        <Animated.View
          style={{
            width: '100%',
            maxWidth: 380,
            backgroundColor: t.elevated,
            borderRadius: radius.xl,
            padding: space.lg,
            gap: space.md,
            alignItems: 'center',
            opacity: pop,
            transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
          }}
        >
          <Animated.View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: t.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
            }}
          >
            <Feather name="download-cloud" size={30} color={t.accent} />
          </Animated.View>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <T v="heading" style={{ textAlign: 'center' }}>Hay una versión nueva</T>
            <T v="caption" color={t.sub} style={{ textAlign: 'center' }}>
              Mi Turno 1.0.{update?.build}
              {day ? ` · ${day}` : ''}
              {mb ? ` · ${mb}` : ''}
            </T>
          </View>
          {update?.title ? (
            <View style={{ alignSelf: 'stretch', backgroundColor: t.bg, borderRadius: radius.md, padding: space.md }}>
              <T v="body" style={{ textAlign: 'center' }}>{update.title}</T>
            </View>
          ) : null}
          <T v="caption" color={t.sub} style={{ textAlign: 'center' }}>
            Se descarga en un momento y tus turnos y ajustes se mantienen.
          </T>
          <View style={{ flexDirection: 'row', gap: space.sm, alignSelf: 'stretch', marginTop: space.xs }}>
            <Button title="Más tarde" kind="soft" onPress={onLater} style={{ flex: 1 }} />
            <Button title="Actualizar" icon="download" onPress={onUpdate} style={{ flex: 1 }} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
