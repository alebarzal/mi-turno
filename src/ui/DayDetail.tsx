import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';

import { formatHours } from '../domain/time';
import type { Shift } from '../domain/types';
import { Button, Chip, T } from './kit';
import { SegmentList, shiftTitle } from './shifts';
import { toneOf, useTheme } from './theme';

/** Tarjeta con todos los detalles del turno de un día. */
export function DayDetail({
  shift,
  codeLabel,
  onEdit,
  onAdd,
}: {
  shift?: Shift;
  codeLabel?: string;
  onEdit?: () => void;
  onAdd?: () => void;
}) {
  const t = useTheme();
  if (!shift) {
    return (
      <View style={{ gap: 14 }}>
        <T v="body" color={t.sub}>No hay ningún turno guardado para este día.</T>
        {onAdd ? <Button title="Añadir turno" icon="plus" kind="soft" onPress={onAdd} /> : null}
      </View>
    );
  }
  const places = [...new Set(shift.segments.map((s) => s.location).filter(Boolean))];
  const info: [string, string][] = [];
  if (shift.hours > 0) info.push(['Horas', formatHours(shift.hours)]);
  if (places.length) info.push(['Ubicación', places.join(' · ')]);
  info.push(['Código en cartelera', shift.code]);
  info.push(['Origen', shift.manual ? 'Editado a mano' : shift.boardId ? 'Cartelera importada' : 'Manual']);

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Chip text={shift.code} tone={toneOf(shift)} />
        <View style={{ flex: 1 }}>
          <T v="heading">{shiftTitle(shift)}</T>
          {codeLabel && codeLabel !== shift.code ? <T v="caption">{codeLabel}</T> : null}
        </View>
      </View>

      {shift.segments.length > 0 ? <SegmentList shift={shift} /> : null}

      <View style={{ backgroundColor: t.card, borderRadius: 14, paddingHorizontal: 14 }}>
        {info.map(([k, v], i) => (
          <View
            key={k}
            style={{
              flexDirection: 'row',
              paddingVertical: 11,
              borderBottomWidth: i === info.length - 1 ? 0 : 0.5,
              borderBottomColor: t.border,
              gap: 12,
            }}
          >
            <T v="label" style={{ flex: 1 }}>{k}</T>
            <Text style={{ color: t.text, fontSize: 14.5, fontWeight: '500', flexShrink: 1, textAlign: 'right' }}>{v}</Text>
          </View>
        ))}
      </View>

      {shift.notes ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Feather name="file-text" size={15} color={t.sub} style={{ marginTop: 3 }} />
          <T v="body" style={{ flex: 1 }}>{shift.notes}</T>
        </View>
      ) : null}

      {onEdit ? <Button title="Editar turno" icon="edit-2" kind="soft" onPress={onEdit} /> : null}
    </View>
  );
}
