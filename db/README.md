# Database

Append-only intake ledger. Postgres — local for development, Neon in production.

## Files

| File | Purpose |
| --- | --- |
| `001_intake.sql` | Tables, triggers, `intake_current` view |
| `002_app_role.sql` | Least-privilege runtime role |
| `003_archive.sql` | `intake_archived` marker table, `intake_current` redefined |
| `verify.sql` | Proves the append-only guarantee actually holds |

## Local setup

```bash
createdb macbook_intake_dev
psql -d macbook_intake_dev -v ON_ERROR_STOP=1 -f db/001_intake.sql
psql -d macbook_intake_dev -v db_name=macbook_intake_dev -f db/002_app_role.sql
psql -d macbook_intake_dev -v ON_ERROR_STOP=1 -f db/003_archive.sql
cp .env.example .env.local                    # DATABASE_URL, AUTH_SECRET, APP_PASSWORD
psql -d macbook_intake_dev -f db/verify.sql   # every "DENIED" line is a pass
```

`002_app_role.sql` prompts for the role password. Don't pass one with `-v app_password=…`
— that writes a production credential into your shell history and exposes it to `ps`.

`verify.sql` writes rows that can't be deleted afterwards, so it refuses to run against a
database whose name doesn't end in `_dev` or contain `test`. It leaves two permanent
`VERIFYONLY01` rows behind; clear them with the reset below.

## Neon

Provision through the Vercel Marketplace (`vercel integration add neon`), then run all three
migrations as `neondb_owner`. Point `DATABASE_URL` at the **pooled** endpoint using the
`macbook_app` role — never `neondb_owner` or `neon_superuser`, or the immutability
guarantee evaporates.

`verify.sql` won't run here: it needs `SET SESSION AUTHORIZATION`, which requires
superuser, and `neondb_owner` isn't one. To confirm the grants took on Neon, check them
directly instead:

```sql
SELECT grantee, privilege_type FROM information_schema.table_privileges
WHERE table_name = 'intake_records' AND grantee = 'macbook_app';
-- expect exactly SELECT and INSERT
```

## Why records can't be edited

Three layers, in order of what stops you first:

1. **Privilege.** `macbook_app` is granted only `SELECT, INSERT` on `intake_records`.
   UPDATE and DELETE aren't revoked so much as never granted.
2. **Triggers.** `intake_records_no_update` / `_no_delete` / `_no_truncate` reject the
   operation for *anyone*, including the owner.
3. **Ownership.** The app role doesn't own the table, so it can't drop those triggers or
   alter the constraints.

The honest limit: someone with owner credentials can drop the triggers and then mutate.
That's a deliberate trade — closing it would need hash-chaining each row. `verify.sql`
demonstrates all three layers.

## Corrections

Never update a record. Insert a new row with `supersedes_id` pointing at the original and
a `correction_note` explaining why. Both rows stay forever; `intake_current` shows only
the live one. A unique partial index keeps the chain linear — a record can be superseded
once, so histories never branch.

## Archiving

Archiving hides a record without touching it. `intake_archived` holds one marker row per
archived record — no copy of the record itself — and `intake_current` excludes anything
listed there. Archiving is an `INSERT`, restoring is a `DELETE` of the marker. The app is
granted `DELETE` on `intake_archived` and still has none on `intake_records`, so all three
layers above are unaffected and `verify.sql` passes unchanged.

Archived records drop out of the records list, the ledger CSV export, and the import
duplicate check — so a bad import can be archived and the corrected file re-imported
without every row reading as a duplicate. They stay visible under the table's
**Include archived** filter and can still be exported by ticking them.

This is deliberately not a `DELETE` on `intake_records`. Removing a row would resurrect
superseded ones: drop the head of a correction chain and the older version it replaced
becomes current again, showing stale data as if it were true. A marker leaves the head in
place, so nothing underneath it resurfaces.

The limit worth knowing: archiving hides data, it does not destroy it. If a record ever has
to be genuinely erased, this doesn't do that.

## Resetting local data

The truncate guard has to be disabled deliberately, which is the point:

```sql
ALTER TABLE intake_records DISABLE TRIGGER intake_records_no_truncate;
TRUNCATE intake_records RESTART IDENTITY CASCADE;
ALTER TABLE intake_records ENABLE TRIGGER intake_records_no_truncate;
```
