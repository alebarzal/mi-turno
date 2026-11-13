import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';

import { actions, getState, useStore } from '../data/store';
import { latestChangelog, shouldShowChangelog } from '../domain/changelog';
import { checkForUpdateInBackground } from '../services/updateCheck';
import { WhatsNew } from '../ui/WhatsNew';
import { Button, T } from '../ui/kit';
import { useTheme } from '../ui/theme';

export default function RootLayout() {
  const t = useTheme();
  const ready = useStore((s) => s.ready);
  const error = useStore((s) => s.error);
  const [showNews, setShowNews] = useState(false);

  // Novedades: se enseñan una vez, la primera vez que se abre la app tras actualizar.
  useEffect(() => {
    if (!ready) return;
    const { settings, shifts } = getState();
    const latest = latestChangelog().id;
    if (shouldShowChangelog(settings.seenChangelog, Object.keys(shifts).length > 0)) setShowNews(true);
    else if (settings.seenChangelog !== latest) actions.updateSettings({ seenChangelog: latest });
  }, [ready]);
  const closeNews = () => {
    setShowNews(false);
    actions.updateSettings({ seenChangelog: latestChangelog().id });
  };

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
      <WhatsNew visible={showNews} onClose={closeNews} />
    </>
  );
}
