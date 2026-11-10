import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Image, View } from 'react-native';

import { useStore } from '../../data/store';
import { boardTitle, formatImported } from '../../ui/boardText';
import { Button, Card, Chip, Empty, Screen, T } from '../../ui/kit';
import { radius, space, useTheme } from '../../ui/theme';

export default function BoardsScreen() {
  const t = useTheme();
  const boards = useStore((s) => s.boards);

  return (
    <Screen title="Carteleras">
      {boards.length === 0 ? (
        <Empty icon="image" title="Sin carteleras" text="Aquí se guardará cada cartelera que importes, con su foto original y los turnos leídos.">
          <Button title="Añadir cartelera" icon="camera" onPress={() => router.push('/scan')} />
        </Empty>
      ) : (
        <View style={{ gap: space.md }}>
          {boards.map((b) => (
            <Card
              key={b.id}
              style={{ flexDirection: 'row', gap: 14, alignItems: 'center', padding: 12 }}
              onPress={() =>
                b.status === 'pending'
                  ? router.push({ pathname: '/review/[id]', params: { id: b.id } })
                  : router.push({ pathname: '/board/[id]', params: { id: b.id } })
              }
            >
              {b.imageUri ? (
                <Image source={{ uri: b.imageUri }} style={{ width: 68, height: 68, borderRadius: radius.md, backgroundColor: t.border }} />
              ) : (
                <View style={{ width: 68, height: 68, borderRadius: radius.md, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="file-text" size={24} color={t.accent} />
                </View>
              )}
              <View style={{ flex: 1, gap: 3 }}>
                <T v="heading" numberOfLines={1}>{boardTitle(b)}</T>
                <T v="caption">Importada el {formatImported(b.importedAt)}</T>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 2 }}>
                  <Chip small text={b.status === 'reviewed' ? 'Revisada' : 'Pendiente de revisar'} tone={b.status === 'reviewed' ? 'off' : 'morning'} />
                  <T v="caption">{b.shiftCount} turnos</T>
                </View>
              </View>
              <Feather name="chevron-right" size={18} color={t.faint} />
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
