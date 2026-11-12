import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';

import type { IconName } from '../../ui/kit';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../ui/theme';

export default function TabsLayout() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const icon =
    (name: IconName) =>
    ({ focused }: { focused: boolean }) => <Feather name={name} size={21} color={focused ? t.accent : t.faint} />;
  return (
    <Tabs
      // Atrás desde otra pestaña vuelve al Calendario en lugar de cerrar la app.
      backBehavior="firstRoute"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.faint,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border, borderTopWidth: StyleSheet.hairlineWidth,
          height: 64 + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', lineHeight: 14, flexShrink: 0 },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Calendario', tabBarIcon: icon('calendar') }} />
      <Tabs.Screen name="hours" options={{ title: 'Mis horas', tabBarIcon: icon('bar-chart-2') }} />
      <Tabs.Screen name="boards" options={{ title: 'Carteleras', tabBarIcon: icon('image') }} />
      <Tabs.Screen name="settings" options={{ title: 'Ajustes', tabBarIcon: icon('sliders') }} />
    </Tabs>
  );
}
