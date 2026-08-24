-- Proves the append-only guarantee actually holds for the runtime role.
-- Run: psql -d macbook_intake_dev -f db/verify.sql
--
-- Every "DENIED" line below is a pass. A row that changes is a failure.
--
-- ############################################################################
-- #  DEVELOPMENT DATABASES ONLY.                                             #
-- #                                                                          #
-- #  This inserts real rows, and the table is append-only by design — there  #
-- #  is no way to remove them afterwards without disabling the truncate      #
-- #  guard as the owner. Run it against production and the ledger carries a  #
-- #  fake VERIFYONLY01 machine forever.                                      #
-- #                                                                          #
-- #  SET SESSION AUTHORIZATION also needs superuser, so this won't run on    #
-- #  Neon as neondb_owner. See db/README.md.                                 #
-- ############################################################################

\pset pager off

-- Guard runs with ON_ERROR_STOP on so it actually halts. The denial tests below
-- need it off, since every expected failure would otherwise abort the script.
\set ON_ERROR_STOP on
DO $$
BEGIN
  IF current_database() NOT LIKE '%\_dev' AND current_database() NOT LIKE '%test%' THEN
    RAISE EXCEPTION
      'Refusing to run verify.sql against "%". It writes permanent, undeletable rows — dev databases only.',
      current_database();
  END IF;
END;
$$;
\set ON_ERROR_STOP off

SET SESSION AUTHORIZATION macbook_app;
SELECT current_user AS connected_as;

-- Serial is deliberately not a real Apple format, so a stray row is obvious.
\set serial '''VERIFYONLY01'''

-- --- INSERT should work -------------------------------------------------
INSERT INTO intake_records
  (serial, identifier, name, model, year, cpu, ram_bytes, hd_bytes,
   battery_health, battery_cycles, physical_issues, functional_issues,
   firmware_locked, os_reset, activation_lock, mdm_enrolled, ingested_by)
VALUES
  (:serial, 'Mac15,6', 'MacBook Pro', 'A2992', 2023, 'Apple M3 Pro',
   19327352832, 536870912000, 94, 247, 'light scuffs on lid', 'none',
   'n/a', 'yes', 'disabled', 'no', 'verify.sql')
RETURNING id, serial, battery_health AS health, ingested_by;

-- Everything below targets this row by id, so the script is repeatable and
-- doesn't care what else is already in the ledger.
SELECT id AS original_id
FROM intake_records
WHERE serial = :serial AND supersedes_id IS NULL
ORDER BY id DESC LIMIT 1 \gset

\echo ''
\echo '--- UPDATE as macbook_app (expect: DENIED) ---'
UPDATE intake_records SET battery_health = 100 WHERE id = :original_id;

\echo ''
\echo '--- DELETE as macbook_app (expect: DENIED) ---'
DELETE FROM intake_records WHERE id = :original_id;

\echo ''
\echo '--- TRUNCATE as macbook_app (expect: DENIED) ---'
TRUNCATE intake_records;

\echo ''
\echo '--- DROP TRIGGER as macbook_app (expect: DENIED — app does not own it) ---'
DROP TRIGGER intake_records_no_update ON intake_records;

\echo ''
\echo '--- ALTER TABLE as macbook_app (expect: DENIED) ---'
ALTER TABLE intake_records DROP CONSTRAINT correction_needs_note;

\echo ''
\echo '--- value unchanged after all attempts (expect: 94) ---'
SELECT id, battery_health FROM intake_records WHERE id = :original_id;

\echo ''
\echo '--- correction path: supersede with a new row (expect: SUCCESS) ---'
INSERT INTO intake_records
  (serial, identifier, name, model, year, cpu, ram_bytes, hd_bytes,
   battery_health, battery_cycles, physical_issues, functional_issues,
   firmware_locked, os_reset, activation_lock, mdm_enrolled, ingested_by,
   supersedes_id, correction_note)
SELECT serial, identifier, name, model, year, cpu, ram_bytes, hd_bytes,
       88, battery_cycles, physical_issues, functional_issues,
       firmware_locked, os_reset, activation_lock, mdm_enrolled, 'verify.sql',
       id, 'battery re-measured after full charge cycle'
FROM intake_records WHERE id = :original_id
RETURNING id, battery_health AS health, supersedes_id, correction_note;

SELECT id AS correction_id
FROM intake_records WHERE supersedes_id = :original_id \gset

\echo ''
\echo '--- correction without a note (expect: DENIED by check constraint) ---'
INSERT INTO intake_records
  (serial, identifier, firmware_locked, os_reset, activation_lock, mdm_enrolled, ingested_by, supersedes_id)
VALUES (:serial, 'Mac15,6', 'n/a', 'yes', 'disabled', 'no', 'verify.sql', :original_id);

\echo ''
\echo '--- second correction off the same row (expect: DENIED, chain stays linear) ---'
INSERT INTO intake_records
  (serial, identifier, firmware_locked, os_reset, activation_lock, mdm_enrolled, ingested_by,
   supersedes_id, correction_note)
VALUES (:serial, 'Mac15,6', 'n/a', 'yes', 'disabled', 'no', 'verify.sql',
        :original_id, 'branching attempt');

\echo ''
\echo '--- ledger keeps both rows (expect: 2) ---'
SELECT count(*) AS rows_from_this_run
FROM intake_records WHERE id IN (:original_id, :correction_id);

\echo ''
\echo '--- the original is superseded, the correction is current (expect: 1 row, health 88) ---'
SELECT id, serial, battery_health AS health, correction_note
FROM intake_current WHERE id IN (:original_id, :correction_id);

\echo ''
\echo '--- archive the correction (expect: SUCCESS, ledger untouched) ---'
INSERT INTO intake_archived (record_id, archived_by, reason)
VALUES (:correction_id, 'verify.sql', 'archive path check')
RETURNING record_id, archived_by;

\echo ''
\echo '--- archiving removed nothing from the ledger (expect: still 2) ---'
SELECT count(*) AS rows_from_this_run
FROM intake_records WHERE id IN (:original_id, :correction_id);

\echo ''
\echo '--- archived head hides the whole chain (expect: 0 rows) ---'
-- The original stays superseded because its successor still exists — archiving
-- marks, it does not remove, so nothing underneath resurfaces.
SELECT id, battery_health AS health
FROM intake_current WHERE id IN (:original_id, :correction_id);

\echo ''
\echo '--- restore drops only the marker (expect: 1 row, health 88) ---'
DELETE FROM intake_archived WHERE record_id = :correction_id RETURNING record_id;
SELECT id, battery_health AS health
FROM intake_current WHERE id IN (:original_id, :correction_id);

\echo ''
\echo '--- archiving still cannot reach intake_records (expect: DENIED) ---'
DELETE FROM intake_records WHERE id = :correction_id;

\echo ''
\echo '--- drafts remain fully mutable (expect: SUCCESS) ---'
INSERT INTO intake_drafts (started_by, identifier, payload)
VALUES ('verify.sql', 'Mac15,6', '{"step":1}') RETURNING id, step, identifier;
UPDATE intake_drafts SET step = 4 WHERE started_by = 'verify.sql';
SELECT step, (updated_at > created_at) AS touch_trigger_fired
FROM intake_drafts WHERE started_by = 'verify.sql';
DELETE FROM intake_drafts WHERE started_by = 'verify.sql';
SELECT count(*) AS drafts_left_behind FROM intake_drafts WHERE started_by = 'verify.sql';

RESET SESSION AUTHORIZATION;

\echo ''
\echo '--- NOTE: this run left 2 permanent rows for serial VERIFYONLY01. ---'
\echo '--- See "Resetting local data" in db/README.md to clear them.      ---'
