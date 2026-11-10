import * as SQLite from 'expo-sqlite';

import { INITIAL_CODES } from '../domain/codes';
import { DEFAULT_SETTINGS, type Board, type CodeDef, type MonthFigures, type Settings, type SharedCalendar, type Shift } from '../domain/types';

/**
 * Base de datos local (SQLite). Todo se guarda en el dispositivo.
 * Esta capa solo sabe leer y escribir filas; la lógica vive en domain/ y el estado en store.ts.
 */

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS shifts (
     date TEXT PRIMARY KEY NOT NULL,
     code TEXT NOT NULL,
     type TEXT NOT NULL,
     segments TEXT NOT NULL,
     hours REAL NOT NULL,
     is_holiday INTEGER NOT NULL DEFAULT 0,
     notes TEXT NOT NULL DEFAULT '',
     board_id TEXT,
     manual INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE IF NOT EXISTS codes (
     code TEXT PRIMARY KEY NOT NULL,
     label TEXT NOT NULL,
     type TEXT NOT NULL,
     segments TEXT NOT NULL,
     end_options TEXT,
     source TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS boards (
     id TEXT PRIMARY KEY NOT NULL,
     image_uri TEXT,
     months TEXT NOT NULL,
     imported_at TEXT NOT NULL,
     status TEXT NOT NULL,
     engine TEXT NOT NULL,
     shift_count INTEGER NOT NULL DEFAULT 0,
     extraction TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS month_figures (
     month TEXT PRIMARY KEY NOT NULL,
     pending_hours REAL,
     compensation_hours REAL,
     total_worked_hours REAL
   );
   CREATE TABLE IF NOT EXISTS settings (
     key TEXT PRIMARY KEY NOT NULL,
     value TEXT NOT NULL
   );`,
  `CREATE TABLE IF NOT EXISTS shared_calendars (
     id TEXT PRIMARY KEY NOT NULL,
     name TEXT NOT NULL,
     received_at TEXT NOT NULL,
     data TEXT NOT NULL
   );`,
];

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('mi-turno.db');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  const fresh = version === 0;
  while (version < MIGRATIONS.length) {
    await db.execAsync(MIGRATIONS[version]);
    version++;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
  if (fresh) for (const c of INITIAL_CODES) await writeCode(db, c);
  return db;
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= open();
  return dbPromise;
}

// ── Lectura ────────────────────────────────────────────────────────────────

interface ShiftRow {
  date: string; code: string; type: string; segments: string; hours: number;
  is_holiday: number; notes: string; board_id: string | null; manual: number;
}
interface CodeRow {
  code: string; label: string; type: string; segments: string; end_options: string | null;
  source: string; updated_at: string;
}
interface BoardRow {
  id: string; image_uri: string | null; months: string; imported_at: string; status: string;
  engine: string; shift_count: number; extraction: string;
}
interface FiguresRow {
  month: string; pending_hours: number | null; compensation_hours: number | null; total_worked_hours: number | null;
}

export interface Snapshot {
  shifts: Shift[];
  codes: CodeDef[];
  boards: Board[];
  figures: MonthFigures[];
  settings: Settings;
}

export async function loadAll(): Promise<Snapshot> {
  const db = await getDb();
  const [shifts, codes, boards, figures, settings] = await Promise.all([
    db.getAllAsync<ShiftRow>('SELECT * FROM shifts'),
    db.getAllAsync<CodeRow>('SELECT * FROM codes'),
    db.getAllAsync<BoardRow>('SELECT * FROM boards ORDER BY imported_at DESC'),
    db.getAllAsync<FiguresRow>('SELECT * FROM month_figures'),
    db.getAllAsync<{ key: string; value: string }>('SELECT * FROM settings'),
  ]);
  const stored: Record<string, unknown> = {};
  for (const s of settings) {
    try {
      stored[s.key] = JSON.parse(s.value);
    } catch {
      // Valor corrupto: se usa el predeterminado.
    }
  }
  return {
    shifts: shifts.map((r) => ({
      date: r.date,
      code: r.code,
      type: r.type as Shift['type'],
      segments: JSON.parse(r.segments),
      hours: r.hours,
      isHoliday: !!r.is_holiday,
      notes: r.notes,
      boardId: r.board_id,
      manual: !!r.manual,
    })),
    codes: codes.map((r) => ({
      code: r.code,
      label: r.label,
      type: r.type as CodeDef['type'],
      segments: JSON.parse(r.segments),
      endOptions: r.end_options ? JSON.parse(r.end_options) : undefined,
      source: r.source as CodeDef['source'],
      updatedAt: r.updated_at,
    })),
    boards: boards.map((r) => ({
      id: r.id,
      imageUri: r.image_uri,
      months: JSON.parse(r.months),
      importedAt: r.imported_at,
      status: r.status as Board['status'],
      engine: r.engine,
      shiftCount: r.shift_count,
      extraction: JSON.parse(r.extraction),
    })),
    figures: figures.map((r) => ({
      month: r.month,
      pendingHours: r.pending_hours,
      compensationHours: r.compensation_hours,
      totalWorkedHours: r.total_worked_hours,
    })),
    settings: { ...DEFAULT_SETTINGS, ...(stored as Partial<Settings>) },
  };
}

export async function loadShared(): Promise<SharedCalendar[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; name: string; received_at: string; data: string }>(
    'SELECT * FROM shared_calendars ORDER BY received_at DESC',
  );
  return rows.map((r) => ({ id: r.id, name: r.name, receivedAt: r.received_at, ...JSON.parse(r.data) }));
}

// ── Escritura ──────────────────────────────────────────────────────────────

type Db = SQLite.SQLiteDatabase;

async function writeShift(db: Db, s: Shift) {
  await db.runAsync(
    `INSERT OR REPLACE INTO shifts (date, code, type, segments, hours, is_holiday, notes, board_id, manual)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [s.date, s.code, s.type, JSON.stringify(s.segments), s.hours, s.isHoliday ? 1 : 0, s.notes, s.boardId, s.manual ? 1 : 0],
  );
}

async function writeCode(db: Db, c: CodeDef) {
  await db.runAsync(
    `INSERT OR REPLACE INTO codes (code, label, type, segments, end_options, source, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [c.code, c.label, c.type, JSON.stringify(c.segments), c.endOptions?.length ? JSON.stringify(c.endOptions) : null, c.source, c.updatedAt],
  );
}

async function writeBoard(db: Db, b: Board) {
  await db.runAsync(
    `INSERT OR REPLACE INTO boards (id, image_uri, months, imported_at, status, engine, shift_count, extraction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [b.id, b.imageUri, JSON.stringify(b.months), b.importedAt, b.status, b.engine, b.shiftCount, JSON.stringify(b.extraction)],
  );
}

async function writeFigures(db: Db, f: MonthFigures) {
  await db.runAsync(
    `INSERT OR REPLACE INTO month_figures (month, pending_hours, compensation_hours, total_worked_hours)
     VALUES (?, ?, ?, ?)`,
    [f.month, f.pendingHours, f.compensationHours, f.totalWorkedHours],
  );
}

export const persist = {
  async shifts(list: Shift[]) {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      for (const s of list) await writeShift(db, s);
    });
  },
  async deleteShift(date: string) {
    await (await getDb()).runAsync('DELETE FROM shifts WHERE date = ?', [date]);
  },
  async code(c: CodeDef) {
    await writeCode(await getDb(), c);
  },
  async deleteCode(code: string) {
    await (await getDb()).runAsync('DELETE FROM codes WHERE code = ?', [code]);
  },
  async board(b: Board) {
    await writeBoard(await getDb(), b);
  },
  async deleteBoard(id: string) {
    const db = await getDb();
    await db.runAsync('DELETE FROM boards WHERE id = ?', [id]);
    await db.runAsync('UPDATE shifts SET board_id = NULL WHERE board_id = ?', [id]);
  },
  async shared(c: SharedCalendar) {
    await (await getDb()).runAsync('INSERT OR REPLACE INTO shared_calendars (id, name, received_at, data) VALUES (?, ?, ?, ?)', [
      c.id,
      c.name,
      c.receivedAt,
      JSON.stringify({ shifts: c.shifts, codes: c.codes, channel: c.channel, version: c.version, rev: c.rev }),
    ]);
  },
  async deleteShared(id: string | null) {
    const db = await getDb();
    if (id) await db.runAsync('DELETE FROM shared_calendars WHERE id = ?', [id]);
    else await db.execAsync('DELETE FROM shared_calendars');
  },
  async figures(f: MonthFigures) {
    await writeFigures(await getDb(), f);
  },
  async setting(key: string, value: unknown) {
    await (await getDb()).runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
  },
  /** Sustituye todo el contenido (restaurar copia de seguridad / borrar datos). */
  async replaceAll(snap: Snapshot) {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      await db.execAsync('DELETE FROM shifts; DELETE FROM codes; DELETE FROM boards; DELETE FROM month_figures; DELETE FROM settings;');
      for (const s of snap.shifts) await writeShift(db, s);
      for (const c of snap.codes) await writeCode(db, c);
      for (const b of snap.boards) await writeBoard(db, b);
      for (const f of snap.figures) await writeFigures(db, f);
      for (const [k, v] of Object.entries(snap.settings)) {
        await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [k, JSON.stringify(v)]);
      }
    });
  },
};
