/**
 * Registro de novedades. La PRIMERA entrada es la de la versión que se está publicando:
 * al añadir algo nuevo, pon una entrada nueva arriba con otro `id` y la app la enseñará
 * una vez a quien actualice. Las demás se muestran resumidas como «versiones anteriores».
 */

export interface ChangeItem {
  /** Nombre de un icono de Feather. */
  icon: string;
  title: string;
  text: string;
}

export interface ChangelogEntry {
  /** Identificador único; cambiarlo es lo que hace que se vuelva a mostrar. */
  id: string;
  /** Versión aproximada (1.0.<n>), solo para mostrar. */
  version: string;
  date: string;
  /** Una línea para la lista de versiones anteriores. */
  summary: string;
  items: ChangeItem[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-11-14-novedades',
    version: '1.0.105',
    date: '2026-11-14',
    summary: 'Esta pantalla de novedades al actualizar.',
    items: [
      {
        icon: 'gift',
        title: 'Novedades al actualizar',
        text: 'Cada vez que instales una versión nueva verás aquí lo que ha cambiado. Puedes volver a verlo en Ajustes → Novedades.',
      },
    ],
  },
  {
    id: '2026-11-13-uso',
    version: '1.0.104',
    date: '2026-11-13',
    summary: 'Deslizar el calendario, compartir el mes, exportar a Google Calendar y aviso de versión nueva.',
    items: [
      { icon: 'chevrons-right', title: 'Desliza el calendario', text: 'Pasa de mes, semana o día deslizando. El botón «Hoy» te devuelve al presente.' },
      { icon: 'edit-2', title: 'Mantén pulsado para editar', text: 'Mantén pulsado un día del mes para cambiar su turno directamente.' },
      { icon: 'arrow-right', title: 'Día anterior y siguiente', text: 'Con las flechas del detalle del día recorres los días sin cerrarlo.' },
      { icon: 'share', title: 'Compartir el mes', text: 'Envía tus turnos como texto por WhatsApp o expórtalos a Google Calendar u Outlook (.ics).' },
      { icon: 'refresh-cw', title: 'Tira para sincronizar', text: 'Si compartes calendario, tira hacia abajo para traer los cambios al momento.' },
      { icon: 'download', title: 'Aviso de versión nueva', text: 'El calendario te avisa cuando hay una actualización disponible.' },
    ],
  },
  {
    id: '2026-11-13-progreso',
    version: '1.0.103',
    date: '2026-11-13',
    summary: 'Barra de progreso con porcentaje al descargar una actualización.',
    items: [{ icon: 'loader', title: 'Barra de progreso', text: 'Al actualizar ves el porcentaje y los MB descargados.' }],
  },
  {
    id: '2026-11-13-actualizar',
    version: '1.0.101',
    date: '2026-11-13',
    summary: 'Actualizar la app desde Ajustes, sin buscar el APK.',
    items: [{ icon: 'download-cloud', title: 'Actualizaciones', text: 'Ajustes → Actualizaciones descarga e instala la última versión.' }],
  },
  {
    id: '2026-11-12-base',
    version: '1.0',
    date: '2026-11-12',
    summary: 'Botón atrás que pregunta antes de salir, sincronización entre teléfonos y logo nuevo.',
    items: [
      { icon: 'corner-up-left', title: 'Botón atrás', text: 'Cierra menús y pregunta antes de salir de la app.' },
      { icon: 'users', title: 'Sincronización', text: 'Al compartir con el código de 6 cifras, los cambios llegan solos al otro teléfono.' },
    ],
  },
  {
    id: '2026-11-10-inicio',
    version: '1.0',
    date: '2026-11-10',
    summary: 'Primera versión: turnos desde la foto de la cartelera, calendario, horas, avisos, widget y copias de seguridad.',
    items: [],
  },
];

export const latestChangelog = (): ChangelogEntry => CHANGELOG[0];

/**
 * ¿Hay que enseñar las novedades? Sí cuando la última entrada no se ha visto todavía.
 * En una instalación nueva (sin turnos y sin nada visto) no se enseña: no hay «novedad».
 */
export function shouldShowChangelog(seen: string, hasData: boolean): boolean {
  if (seen === latestChangelog().id) return false;
  return seen !== '' || hasData;
}
