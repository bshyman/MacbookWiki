-- Archiving. Hides a record without touching it.
--
-- intake_records stays exactly as append-only as it was: no new column (there's
-- no UPDATE grant to set one anyway), no trigger changes, no new grants on the
-- ledger. Archiving is an INSERT into a side table and restoring is a DELETE
-- from it, so db/verify.sql still passes unchanged.
--
-- Deliberately not a DELETE on intake_records. Removing rows would resurrect
-- superseded ones — drop the head of a correction chain and the older version
-- it replaced becomes current again, showing stale data as if it were the
-- truth. Marking instead of removing sidesteps that entirely: the head is still
-- there, so nothing underneath it resurfaces.
--
-- Run as the owner (locally: your superuser; on Neon: neondb_owner).

BEGIN;

-- ---------------------------------------------------------------- archive ---
-- One row per archived record. No copy of the record itself — the ledger row
-- never goes anywhere, this just says "stop counting it".
CREATE TABLE IF NOT EXISTS intake_archived (
  record_id   bigint PRIMARY KEY REFERENCES intake_records(id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  archived_by text NOT NULL CHECK (length(btrim(archived_by)) > 0),
  reason      text
);

CREATE INDEX IF NOT EXISTS idx_intake_archived_archived_at
  ON intake_archived (archived_at DESC);

-- ------------------------------------------------------------------ view ---
-- Current truth: not superseded by a correction, and not archived.
CREATE OR REPLACE VIEW intake_current AS
SELECT r.*
FROM intake_records r
WHERE NOT EXISTS (
  SELECT 1 FROM intake_records c WHERE c.supersedes_id = r.id
)
AND NOT EXISTS (
  SELECT 1 FROM intake_archived a WHERE a.record_id = r.id
);

-- ---------------------------------------------------------------- grants ---
-- DELETE here removes an archive marker, never a ledger row. That's what makes
-- archiving reversible without handing the app any power over intake_records.
GRANT SELECT, INSERT, DELETE ON intake_archived TO macbook_app;
REVOKE ALL ON intake_archived FROM PUBLIC;

COMMIT;
