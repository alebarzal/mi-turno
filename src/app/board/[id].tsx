import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Image, View } from 'react-native';

import { actions, useStore } from '../../data/store';
import { monthDates } from '../../domain/stats';
import { formatHours, monthLabel } from '../../domain/time';
import { ENGINE_NAMES } from '../../recognition';
import { Button, Card, Chip, Empty, IconButton, Screen, Section, Sheet, T, Tap, confirmAsync } from '../../ui/kit';
import { DayRow, Stat } from '../../ui/shifts';
import { radius, space, useTheme } from '../../ui/theme';
import { boardTitle, formatImported } from '../../ui/boardText';

export default function BoardScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const board = useStore((s) => s.boards.find((b) => b.id === id));
  const shifts = useStore((s) => s.shifts);
  const [zoom, setZoom] = useState(false);

  const days = useMemo(
    () => (board ? board.months.flatMap(monthDates).filter((d) => shifts[d]?.boardId === board.id) : []),
    [board, shifts],
  );

  if (!board) {
    return (
      <Screen title="Cartelera" right={<IconButton icon="arrow-left" label="Volver" onPress={() => router.back()} />}>
        <Empty icon="alert-circle" title="Cartelera no encontrada" text="Puede que la hayas eliminado del historial." />
      </Screen>
    );
  }
  const hours = Math.round(days.reduce((a, d) => a + shifts[d].hours, 0) * 100) / 100;

  return (
    <Screen
      title={boardTitle(board)}
      subtitle={`Importada el ${formatImported(board.importedAt)}`}
      right={<IconButton icon="arrow-left" label="Volver" onPress={() => router.back()} />}
    >
      {board.imageUri ? (
        <Tap onPress={() => setZoom(true)} label="Ampliar la foto original" scaleTo={0.99}>
          <Image source={{ uri: board.imageUri }} resizeMode="cover" style={{ width: '100%', height: 220, borderRadius: radius.lg, backgroundColor: t.card }} />
        </Tap>
      ) : (
        <Card>
          <T v="label">Esta cartelera no tiene foto (viene de una copia de seguridad).</T>
        </Card>
      )}

      <Card style={{ marginTop: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Chip text={board.status === 'reviewed' ? 'Revisada' : 'Pendiente de revisar'} tone={board.status === 'reviewed' ? 'off' : 'morning'} />
          <T v="caption" style={{ flex: 1 }}>Leída con {ENGINE_NAMES[board.extraction.engine] ?? board.engine}</T>
        </View>
        <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.lg }}>
          <Stat label="Turnos" value={String(days.filter((d) => shifts[d].hours > 0).length)} />
          <Stat label="Días libres" value={String(days.filter((d) => shifts[d].type === 'off').length)} />
          <Stat label="Horas" value={formatHours(hours)} />
        </View>
      </Card>

      <View style={{ gap: space.sm, marginTop: space.md }}>
        <Button
          title={board.status === 'reviewed' ? 'Volver a revisar la lectura' : 'Revisar y guardar'}
          icon="check-square"
          kind={board.status === 'reviewed' ? 'soft' : 'primary'}
          onPress={() => router.push({ pathname: '/review/[id]', params: { id: board.id } })}
        />
        <Button
          title="Eliminar del historial"
          kind="danger"
          icon="trash-2"
          onPress={async () => {
            if (await confirmAsync('Eliminar cartelera', 'Se borrará la foto y la lectura. Los turnos que ya están en tu calendario se conservan.', 'Eliminar', true)) {
              router.back();
              await actions.deleteBoard(board.id);
            }
          }}
        />
      </View>

      {board.months.map((m) => {
        const list = days.filter((d) => d.startsWith(m));
        if (list.length === 0) return null;
        return (
          <Section key={m} title={`Turnos extraídos · ${monthLabel(m)}`}>
            <Card style={{ paddingVertical: 4 }}>
              {list.map((d, i) => (
                <DayRow key={d} date={d} shift={shifts[d]} last={i === list.length - 1} />
              ))}
            </Card>
          </Section>
        );
      })}

      <Sheet visible={zoom} onClose={() => setZoom(false)} title="Foto original">
        {board.imageUri ? <Image source={{ uri: board.imageUri }} resizeMode="contain" style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 12 }} /> : null}
      </Sheet>
    </Screen>
  );
}
