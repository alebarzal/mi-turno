import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { actions, snapshot, useStore } from '../../data/store';
import type { EnginePref, ThemePref } from '../../domain/types';
import { engineStatuses, type EngineStatus } from '../../recognition';
import { exportBackup, pickBackup } from '../../services/backup';
import { requestNotificationPermission } from '../../services/notifications';
import { getApiKey, setApiKey } from '../../services/secrets';
import { Banner, Button, Card, Field, Row, Screen, Section, Segmented, SwitchRow, T, confirmAsync, notify } from '../../ui/kit';
import { space, useTheme } from '../../ui/theme';

function Stepper({ value, options, onChange, format }: { value: number; options: number[]; onChange: (v: number) => void; format: (v: number) => string }) {
  const i = Math.max(0, options.indexOf(value));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Button title="−" kind="soft" onPress={() => onChange(options[Math.max(0, i - 1)])} style={{ paddingVertical: 4, paddingHorizontal: 12 }} />
      <T v="label" style={{ minWidth: 62, textAlign: 'center' }}>{format(value)}</T>
      <Button title="+" kind="soft" onPress={() => onChange(options[Math.min(options.length - 1, i + 1)])} style={{ paddingVertical: 4, paddingHorizontal: 12 }} />
    </View>
  );
}

export default function SettingsScreen() {
  const t = useTheme();
  const s = useStore((st) => st.settings);
  const codeCount = useStore((st) => Object.keys(st.codes).length);
  const [name, setName] = useState(s.employeeName);
  const [key, setKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [engines, setEngines] = useState<EngineStatus[]>([]);

  const refreshEngines = () => engineStatuses().then(setEngines);
  useEffect(() => {
    getApiKey().then((k) => setHasKey(!!k));
    refreshEngines();
  }, []);

  /** Activa un aviso pidiendo antes el permiso del sistema. */
  const toggleNotification = async (patch: Parameters<typeof actions.updateSettings>[0], turningOn: boolean) => {
    if (turningOn && !(await requestNotificationPermission())) {
      notify('Avisos desactivados', 'Permite las notificaciones de Mi Turno en los ajustes del teléfono para recibir avisos.');
      return;
    }
    await actions.updateSettings(patch);
  };

  const local = engines.find((e) => e.id === 'local');

  return (
    <Screen title="Ajustes">
      <Section title="Tu fila en la cartelera">
        <Card>
          <Field
            label="Nombre tal como aparece en la cartelera"
            value={name}
            onChangeText={setName}
            placeholder="Tu nombre en la cartelera"
            autoCapitalize="characters"
            autoCorrect={false}
            onBlur={() => {
              const v = name.trim();
              if (v && v !== s.employeeName) actions.updateSettings({ employeeName: v, nameChosen: true });
              else setName(s.employeeName);
            }}
            hint="Solo se leerá la fila con este nombre exacto."
          />
        </Card>
      </Section>

      <Section title="Reconocimiento">
        <Card style={{ gap: space.md }}>
          <Segmented<EnginePref>
            value={s.engine}
            onChange={(engine) => actions.updateSettings({ engine })}
            options={[
              { value: 'auto', label: 'Automático' },
              { value: 'claude', label: 'IA de visión' },
              { value: 'local', label: 'OCR local' },
            ]}
          />
          <T v="caption">
            {s.engine === 'auto'
              ? 'Usa la IA de visión si hay clave de API; si no, o si falla, el OCR del teléfono.'
              : s.engine === 'claude'
                ? 'La más fiable con tablas fotografiadas. La foto se envía a Anthropic para analizarla.'
                : 'La foto no sale del teléfono. Menos fiable: revisa bien el resultado.'}
          </T>
          <Field
            label={hasKey ? 'Clave de API de Anthropic (guardada)' : 'Clave de API de Anthropic'}
            value={key}
            onChangeText={setKey}
            placeholder={hasKey ? '••••••••••••••••' : 'sk-ant-…'}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            hint="Se guarda cifrada en este dispositivo. Se crea en console.anthropic.com y se paga por uso."
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              title="Guardar clave"
              kind="soft"
              disabled={!key.trim()}
              style={{ flex: 1 }}
              onPress={async () => {
                await setApiKey(key);
                setKey('');
                setHasKey(true);
                refreshEngines();
              }}
            />
            {hasKey ? (
              <Button
                title="Quitar"
                kind="danger"
                onPress={async () => {
                  await setApiKey(null);
                  setHasKey(false);
                  refreshEngines();
                }}
              />
            ) : null}
          </View>
          {local?.unavailableReason && s.engine !== 'claude' ? <Banner tone="info" icon="smartphone" text={local.unavailableReason} /> : null}
        </Card>
        <Card style={{ marginTop: space.md, paddingVertical: 2 }}>
          <Row title="Diccionario de códigos" detail={`${codeCount} códigos aprendidos`} icon="book-open" onPress={() => router.push('/codes')} last />
        </Card>
      </Section>

      <Section title="Avisos">
        <Card style={{ paddingVertical: 2 }}>
          <SwitchRow
            title="Antes de empezar el turno"
            detail="Te avisa con antelación de cada entrada"
            value={s.notifyBefore}
            onChange={(v) => toggleNotification({ notifyBefore: v }, v)}
          />
          {s.notifyBefore ? (
            <Row
              title="Antelación"
              right={
                <Stepper
                  value={s.notifyBeforeMinutes}
                  options={[15, 30, 45, 60, 90, 120, 180]}
                  onChange={(v) => actions.updateSettings({ notifyBeforeMinutes: v })}
                  format={(v) => (v < 60 ? `${v} min` : `${String(v / 60).replace('.', ',')} h`)}
                />
              }
            />
          ) : null}
          <SwitchRow title="A la hora de entrada" value={s.notifyAtStart} onChange={(v) => toggleNotification({ notifyAtStart: v }, v)} />
          <SwitchRow
            title="Próximo turno"
            detail="Al terminar, te recuerda cuándo vuelves"
            value={s.notifyNextShift}
            onChange={(v) => toggleNotification({ notifyNextShift: v }, v)}
          />
          <SwitchRow
            title="Resumen de mañana"
            detail="Cada tarde, el turno del día siguiente"
            value={s.notifyDailySummary}
            onChange={(v) => toggleNotification({ notifyDailySummary: v }, v)}
          />
          {s.notifyDailySummary ? (
            <Row
              title="Hora del resumen"
              right={
                <Stepper
                  value={s.dailySummaryHour}
                  options={Array.from({ length: 24 }, (_, i) => i)}
                  onChange={(v) => actions.updateSettings({ dailySummaryHour: v })}
                  format={(v) => `${String(v).padStart(2, '0')}:00`}
                />
              }
            />
          ) : null}
          <SwitchRow
            title="Recordar la cartelera nueva"
            detail={`El día ${s.newBoardDay}, si aún no tienes el mes siguiente`}
            value={s.notifyNewBoard}
            onChange={(v) => toggleNotification({ notifyNewBoard: v }, v)}
            last
          />
        </Card>
      </Section>

      <Section title="Apariencia">
        <Card>
          <Segmented<ThemePref>
            value={s.theme}
            onChange={(theme) => actions.updateSettings({ theme })}
            options={[
              { value: 'system', label: 'Sistema' },
              { value: 'light', label: 'Claro' },
              { value: 'dark', label: 'Oscuro' },
            ]}
          />
        </Card>
      </Section>

      <Section title="Tus datos">
        <Card style={{ paddingVertical: 2 }}>
          <Row
            title="Compartir con otra persona"
            detail="Con un código de 6 cifras"
            icon="share-2"
            onPress={() => router.push('/share')}
          />
          <Row
            title="Exportar copia de seguridad"
            detail="Turnos, diccionario y ajustes en un archivo"
            icon="download"
            onPress={() => exportBackup(snapshot()).catch((e) => notify('No se ha podido exportar', e instanceof Error ? e.message : undefined))}
          />
          <Row
            title="Restaurar una copia"
            detail="Sustituye los datos actuales"
            icon="upload"
            onPress={async () => {
              try {
                const snap = await pickBackup();
                if (!snap) return;
                if (await confirmAsync('Restaurar copia', `La copia tiene ${snap.shifts.length} días. Se sustituirán todos los datos actuales de la app.`, 'Restaurar', true)) {
                  await actions.restore(snap);
                  setName(snap.settings.employeeName);
                  notify('Copia restaurada');
                }
              } catch (e) {
                notify('No se ha podido restaurar', e instanceof Error ? e.message : undefined);
              }
            }}
          />
          <Row
            title="Borrar todos los datos"
            icon="trash-2"
            danger
            last
            onPress={async () => {
              if (await confirmAsync('Borrar todo', 'Se eliminarán turnos, carteleras, fotos y ajustes de este dispositivo. No se puede deshacer.', 'Borrar todo', true)) {
                await actions.eraseAll();
                setName('');
              }
            }}
          />
        </Card>
        <T v="caption" style={{ marginTop: space.md, marginHorizontal: 4 }}>
          Mi Turno no necesita cuenta. Tus turnos y tus fotos se guardan solo en este dispositivo; las fotos únicamente salen de él si
          usas la IA de visión para leerlas.
        </T>
      </Section>
      <View style={{ height: 0, backgroundColor: t.bg }} />
    </Screen>
  );
}
