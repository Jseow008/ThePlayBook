import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import assert from 'node:assert/strict';

const databaseUrl = process.env.CONTENT_CONTINUITY_DATABASE_URL || process.env.DB107_ADMIN_DATABASE_URL;
assert.ok(databaseUrl, 'An explicitly disposable database URL is required');
const hostname = new URL(databaseUrl).hostname;
if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
  assert.equal(process.env.CONTENT_CONTINUITY_DISPOSABLE, '1', 'Explicit disposable database required');
  assert.ok(!hostname.includes('xmuqsgfxuaaophxnwure'), 'Production is not a disposable database');
}
const sql = await readFile(new URL('./database-annotation-revision-proof.sql', import.meta.url), 'utf8');
const db = new Client({ connectionString: databaseUrl });
await db.connect();
try {
  // No bind parameters: pg uses the simple-query protocol, which accepts the
  // explicit BEGIN / assertions / ROLLBACK transaction in this proof.
  await db.query(sql);
  console.log('Annotation revision behavior proof passed; all fixtures rolled back.');
} finally {
  await db.query('ROLLBACK');
  await db.end();
}
