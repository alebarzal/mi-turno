import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

import { actions, snapshot, useStore } from '../../data/store';
import type { EnginePref, ThemePref } from '../../domain/types';
import { engineStatuses, type EngineStatus } from '../../recognition';
import { exportBackup, pickBackup } from '../../services/backup';
import { requestNotificationPermission } from '../../services/notifications';
import { getApiKey, setApiKey } from '../../services/secrets';
import { dismissUpdate } from '../../services/updateCheck';
import { currentLabel, fetchLatest, installUpdate, isNewer, progressFraction } from '../../services/updates';
import { ProgressBar } from '../../ui/ProgressBar';
import { WhatsNew } from '../../ui/WhatsNew';
import { latestChangelog } from '../../domain/changelog';
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

  const [updating, setUpdating] = useState<'' | 'checking' | 'downloading'>('');
  const [updateInfo, setUpdateInfo] = useState(currentLabel());
  const [newsOpen, setNewsOpen] = useState(false);
  const [download, setDownload] = useState<{ fraction: number; written: number; total: number } | null>(null);
  const checkUpdate = async () => {
    if (updating) return;
    setUpdating('checking');
    try {
      const u = await fetchLatest();
      if (!u) {
        setUpdateInfo('Todavía no hay ninguna versión publicada');
        return;
      }
      if (!isNewer(u)) {
        dismissUpdate();
        setUpdateInfo(`${currentLabel()} · ya es la última`);
        return;
      }
      const day = u.date ? new Date(u.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }) : '';
      const mb = u.size ? ` (${Math.round(u.size / 1e6)} MB)` : '';
      setUpdateInfo(`Hay una versión nueva: 1.0.${u.build}`);
      const ok = await confirmAsync(
        'Nueva versión',
        `${u.title}${day ? `\n\nPublicada el ${day}.` : ''}\n\nSe descargará${mb} y Android te pedirá confirmar la instalación. Tus turnos y ajustes se mantienen.`,
        'Actualizar',
      );
      if (!ok) return;
      dismissUpdate();
      setUpdating('downloading');
      setDownload({ fraction: 0, written: 0, total: u.size });
      let shown = -1;
      await installUpdate(u, (p) => {
        const fraction = progressFraction(p, u.size);
        const pct = Math.floor(fraction * 100);
        if (pct === shown) return; // un repintado por cada 1 %
        shown = pct;
        setDownload({ fraction, written: Math.round(fraction * (u.size || p.total)), total: u.size || p.total });
      });
    } catch (e) {
      notify('No se ha podido actualizar', e instanceof Error ? e.message : undefined);
    } finally {
      setUpdating('');
      setTimeout(() => setDownload(null), 600);
    }
  };

  // Desde el aviso de «versión nueva» del calendario se llega aquí con ?update=1.
  const params = useLocalSearchParams<{ update?: string }>();
  useEffect(() => {
    if (params.update !== '1') return;
    router.setParams({ update: undefined });
    checkUpdate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.update]);

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

      {Platform.OS === 'android' ? (
        <Section title="Botón atrás">
          <Card style={{ paddingVertical: 2 }}>
            <SwitchRow
              title="Preguntar antes de salir"
              detail="Al pulsar atrás en el calendario"
              value={s.confirmExit}
              onChange={(confirmExit) => actions.updateSettings({ confirmExit })}
              last
            />
          </Card>
        </Section>
      ) : null}

      {Platform.OS === 'android' ? (
        <Section title="Actualizaciones">
          <Card style={{ paddingVertical: 2 }}>
            <Row
              title={updating === 'downloading' ? 'Descargando…' : updating === 'checking' ? 'Buscando…' : 'Buscar actualizaciones'}
              detail={updateInfo}
              icon="refresh-cw"
              right={updating === 'checking' ? <ActivityIndicator color={t.accent} /> : undefined}
              onPress={checkUpdate}
              last={!download}
            />
            {download ? (
              <View style={{ paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: space.md, gap: 8 }}>
                <ProgressBar value={download.fraction} active={download.fraction < 1} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <T v="caption">
                    {download.fraction >= 1
                      ? 'Abriendo el instalador…'
                      : download.total
                        ? `${(download.written / 1e6).toFixed(1)} de ${(download.total / 1e6).toFixed(1)} MB`
                        : 'Descargando…'}
                  </T>
                  <T v="label" color={t.accent} style={{ fontVariant: ['tabular-nums'] }}>
                    {Math.floor(download.fraction * 100)} %
                  </T>
                </View>
              </View>
            ) : null}
          </Card>
          <T v="caption" style={{ marginTop: space.md, marginHorizontal: 4 }}>
            Descarga la última versión publicada en GitHub. La primera vez Android te pedirá permitir instalar apps desde Mi Turno.
          </T>
        </Section>
      ) : null}

      <Section title="Acerca de">
        <Card style={{ paddingVertical: 2 }}>
          <Row
            title="Novedades"
            detail={latestChangelog().summary}
            icon="gift"
            onPress={() => setNewsOpen(true)}
            last
          />
        </Card>
      </Section>
      <WhatsNew visible={newsOpen} onClose={() => setNewsOpen(false)} />

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
