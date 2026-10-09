import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

export const sqlite = openDatabaseSync('fitness.db', { enableChangeListener: true });
sqlite.execSync('PRAGMA foreign_keys = ON;');

/**
 * The Expo driver is synchronous: `db.transaction` callbacks must not be async.
 * Inside a transaction use `.run()`, `.all()`, `.get()` and relational `.sync()`.
 */
export const db = drizzle(sqlite, { schema });
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
