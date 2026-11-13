import { Feather } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { CHANGELOG, latestChangelog } from '../domain/changelog';
import { shortDate } from '../domain/time';
import { CURRENT } from '../services/updates';
import { Button, Card, FadeIn, Sheet, T, type IconName } from './kit';
import { radius, space, useTheme } from './theme';

/** Hoja con lo nuevo de esta versión y un resumen de las anteriores. */
export function WhatsNew({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const entry = latestChangelog();
  const version = CURRENT.build ? `1.0.${CURRENT.build}` : entry.version;
  const older = CHANGELOG.slice(1);

  return (
    <Sheet visible={visible} onClose={onClose} title="Novedades" footer={<Button title="¡Entendido!" big onPress={onClose} />}>
      <View style={{ alignItems: 'center', paddingVertical: space.md, gap: 6 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="gift" size={26} color={t.accent} />
        </View>
        <T v="heading">Lo nuevo en Mi Turno</T>
        <T v="caption" color={t.sub}>
          Versión {version} · {shortDate(entry.date)}
        </T>
      </View>

      <View style={{ gap: space.sm }}>
        {entry.items.map((it, i) => (
          <FadeIn key={it.title} delay={80 + i * 60}>
            <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <View style={{ width: 34, height: 34, borderRadius: radius.sm, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name={it.icon as IconName} size={17} color={t.accent} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T v="label" style={{ fontWeight: '600' }}>{it.title}</T>
                <T v="caption" color={t.sub}>{it.text}</T>
              </View>
            </Card>
          </FadeIn>
        ))}
      </View>

      {older.length ? (
        <View style={{ marginTop: space.xl }}>
          <T v="label" color={t.sub} style={{ marginBottom: space.sm, marginLeft: 4 }}>Versiones anteriores</T>
          <Card style={{ paddingVertical: 4 }}>
            {older.map((e, i) => (
              <View
                key={e.id}
                style={{
                  flexDirection: 'row',
                  gap: 12,
                  paddingVertical: 10,
                  borderBottomWidth: i === older.length - 1 ? 0 : 0.5,
                  borderBottomColor: t.border,
                }}
              >
                <View style={{ width: 62 }}>
                  <T v="caption" style={{ fontWeight: '700' }}>{e.version}</T>
                  <T v="caption" color={t.faint}>{shortDate(e.date)}</T>
                </View>
                <T v="caption" color={t.sub} style={{ flex: 1 }}>{e.summary}</T>
              </View>
            ))}
          </Card>
        </View>
      ) : null}
    </Sheet>
  );
}
