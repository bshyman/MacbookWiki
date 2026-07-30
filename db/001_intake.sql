-- Intake schema. Append-only ledger + mutable drafts.
--
-- The immutability guarantee is layered:
--   1. The app role is granted only SELECT/INSERT on intake_records — it has no
--      UPDATE/DELETE privilege to begin with.
--   2. Triggers reject UPDATE/DELETE regardless of who attempts them.
--   3. The app role does NOT own these objects, so it cannot DROP the triggers
--      or ALTER the table out from under itself.
--
-- Run as the owner (locally: your superuser; on Neon: neondb_owner).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------- records ---
-- One row per completed intake. Never updated, never deleted. Corrections are
-- new rows pointing at what they replace via supersedes_id.
CREATE TABLE IF NOT EXISTS intake_records (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- identification
  serial            text   NOT NULL CHECK (length(btrim(serial)) > 0),
  identifier        text   NOT NULL CHECK (length(btrim(identifier)) > 0),
  name              text,
  model             text,
  year              integer CHECK (year BETWEEN 2006 AND 2100),
  cpu               text,
  ram_bytes         bigint  CHECK (ram_bytes > 0),
  hd_bytes          bigint  CHECK (hd_bytes >= 0),

  -- battery
  battery_health    integer CHECK (battery_health BETWEEN 0 AND 100),
  battery_cycles    integer CHECK (battery_cycles >= 0),

  -- condition
  physical_issues   text,
  functional_issues text,

  -- locks and reset state
  firmware_locked   text NOT NULL CHECK (firmware_locked IN ('yes', 'no', 'cleared', 'n/a')),
  os_reset          text NOT NULL CHECK (os_reset IN ('yes', 'no')),
  activation_lock   text NOT NULL CHECK (activation_lock IN ('enabled', 'disabled', 'unsupported', 'unknown')),
  mdm_enrolled      text NOT NULL CHECK (mdm_enrolled IN ('yes', 'no', 'unknown')),

  -- anything that stops resale, recorded at commit time
  blockers          text[] NOT NULL DEFAULT '{}',

  processed_at      timestamptz NOT NULL DEFAULT now(),
  ingested_by       text NOT NULL CHECK (length(btrim(ingested_by)) > 0),

  -- correction chain
  supersedes_id     bigint REFERENCES intake_records(id),
  correction_note   text,

  CONSTRAINT correction_needs_note
    CHECK (supersedes_id IS NULL OR length(btrim(coalesce(correction_note, ''))) > 0),
  CONSTRAINT no_self_supersede
    CHECK (supersedes_id IS NULL OR supersedes_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_intake_records_serial       ON intake_records (serial);
CREATE INDEX IF NOT EXISTS idx_intake_records_identifier   ON intake_records (identifier);
CREATE INDEX IF NOT EXISTS idx_intake_records_processed_at ON intake_records (processed_at DESC);

-- One correction per record keeps the chain linear — no branching histories.
CREATE UNIQUE INDEX IF NOT EXISTS idx_intake_records_supersedes
  ON intake_records (supersedes_id) WHERE supersedes_id IS NOT NULL;

-- ------------------------------------------------------------ immutability ---
CREATE OR REPLACE FUNCTION intake_records_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'intake_records is append-only: % rejected. Insert a correcting row with supersedes_id instead.',
    TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS intake_records_no_update ON intake_records;
CREATE TRIGGER intake_records_no_update
  BEFORE UPDATE ON intake_records
  FOR EACH ROW EXECUTE FUNCTION intake_records_append_only();

DROP TRIGGER IF EXISTS intake_records_no_delete ON intake_records;
CREATE TRIGGER intake_records_no_delete
  BEFORE DELETE ON intake_records
  FOR EACH ROW EXECUTE FUNCTION intake_records_append_only();

-- TRUNCATE bypasses row triggers, so it needs its own statement-level guard.
DROP TRIGGER IF EXISTS intake_records_no_truncate ON intake_records;
CREATE TRIGGER intake_records_no_truncate
  BEFORE TRUNCATE ON intake_records
  FOR EACH STATEMENT EXECUTE FUNCTION intake_records_append_only();

-- What's true now: every record that hasn't been superseded.
CREATE OR REPLACE VIEW intake_current AS
SELECT r.*
FROM intake_records r
WHERE NOT EXISTS (
  SELECT 1 FROM intake_records c WHERE c.supersedes_id = r.id
);

-- ----------------------------------------------------------------- drafts ---
-- Work in progress. Freely mutable, deleted once committed to the ledger.
CREATE TABLE IF NOT EXISTS intake_drafts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Upper bound must match MAX_STEP in lib/intake-steps.ts. Adding a wizard step
  -- past 10 needs a migration widening this first — the app clamps to MAX_STEP,
  -- so a mismatch silently parks drafts on the wrong step instead of erroring.
  step        smallint NOT NULL DEFAULT 1 CHECK (step BETWEEN 1 AND 10),
  payload     jsonb    NOT NULL DEFAULT '{}'::jsonb,
  -- denormalized out of payload so the drafts list doesn't parse JSON
  serial      text,
  identifier  text,
  started_by  text NOT NULL CHECK (length(btrim(started_by)) > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intake_drafts_updated_at ON intake_drafts (updated_at DESC);

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS intake_drafts_touch ON intake_drafts;
CREATE TRIGGER intake_drafts_touch
  BEFORE UPDATE ON intake_drafts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

COMMIT;
