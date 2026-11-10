import { monthLabel } from '../domain/time';
import type { Board } from '../domain/types';

export const boardTitle = (b: Board) => (b.months.length ? b.months.map(monthLabel).join(' · ') : 'Cartelera');

export const formatImported = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
