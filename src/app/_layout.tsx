import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';

import { actions, useStore } from '../data/store';
import { checkForUpdateInBackground } from '../services/updateCheck';
import { Button, T } from '../ui/kit';
import { useTheme } from '../ui/theme';

export default function RootLayout() {
  const t = useTheme();
  const ready = useStore((s) => s.ready);
  const error = useStore((s) => s.error);

  useEffect(() => {
    actions.init();
  }, []);

  useEffect(() => {
    if (!ready) return;
    actions.syncNow();
    checkForUpdateInBackground();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') actions.syncNow();
    }, 15000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        actions.syncNow();
        checkForUpdateInBackground();
      }
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [ready]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
        <StatusBar style={t.dark ? 'light' : 'dark'} />
        {error ? (
          <>
            <T v="heading" style={{ textAlign: 'center' }}>No se han podido abrir tus datos</T>
            <T v="body" color={t.sub} style={{ textAlign: 'center' }}>{error}</T>
            <Button title="Reintentar" onPress={() => actions.init()} />
          </>
        ) : (
          <ActivityIndicator color={t.accent} />
        )}
      </View>
    );
  }

  return (
    <>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="scan" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="review/[id]" options={{ gestureEnabled: false }} />
        <Stack.Screen name="board/[id]" />
        <Stack.Screen name="codes" />
      </Stack>
    </>
  );
}
