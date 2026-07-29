-- Proves the append-only guarantee actually holds for the runtime role.
-- Run: psql -d macbook_intake_dev -f db/verify.sql
--
-- Every "DENIED" line below is a pass. A row that changes is a failure.

\set ON_ERROR_STOP off
\pset pager off

SET SESSION AUTHORIZATION macbook_app;
SELECT current_user AS connected_as;

-- --- INSERT should work -------------------------------------------------
INSERT INTO intake_records
  (serial, identifier, name, model, year, cpu, ram_bytes, hd_bytes,
   battery_health, battery_cycles, physical_issues, functional_issues,
   firmware_locked, os_reset, activation_lock, mdm_enrolled, ingested_by)
VALUES
  ('RW2D0HDQRJ', 'Mac15,6', 'MacBook Pro', 'A2992', 2023, 'Apple M3 Pro',
   19327352832, 536870912000, 94, 247, 'light scuffs on lid', 'none',
   'n/a', 'yes', 'disabled', 'no', 'bshyman')
RETURNING id, serial, battery_health AS health, ingested_by;

\echo ''
\echo '--- UPDATE as macbook_app (expect: DENIED) ---'
UPDATE intake_records SET battery_health = 100 WHERE serial = 'RW2D0HDQRJ';

\echo ''
\echo '--- DELETE as macbook_app (expect: DENIED) ---'
DELETE FROM intake_records WHERE serial = 'RW2D0HDQRJ';

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
SELECT serial, battery_health FROM intake_records WHERE serial = 'RW2D0HDQRJ';

\echo ''
\echo '--- correction path: supersede with a new row (expect: SUCCESS) ---'
INSERT INTO intake_records
  (serial, identifier, name, model, year, cpu, ram_bytes, hd_bytes,
   battery_health, battery_cycles, physical_issues, functional_issues,
   firmware_locked, os_reset, activation_lock, mdm_enrolled, ingested_by,
   supersedes_id, correction_note)
SELECT serial, identifier, name, model, year, cpu, ram_bytes, hd_bytes,
       88, battery_cycles, physical_issues, functional_issues,
       firmware_locked, os_reset, activation_lock, mdm_enrolled, 'bshyman',
       id, 'battery re-measured after full charge cycle'
FROM intake_records WHERE serial = 'RW2D0HDQRJ' AND supersedes_id IS NULL
RETURNING id, battery_health AS health, supersedes_id, correction_note;

\echo ''
\echo '--- correction without a note (expect: DENIED by check constraint) ---'
INSERT INTO intake_records
  (serial, identifier, firmware_locked, os_reset, activation_lock, mdm_enrolled, ingested_by, supersedes_id)
VALUES ('RW2D0HDQRJ', 'Mac15,6', 'n/a', 'yes', 'disabled', 'no', 'bshyman', 1);

\echo ''
\echo '--- second correction off the same row (expect: DENIED, chain stays linear) ---'
INSERT INTO intake_records
  (serial, identifier, firmware_locked, os_reset, activation_lock, mdm_enrolled, ingested_by,
   supersedes_id, correction_note)
VALUES ('RW2D0HDQRJ', 'Mac15,6', 'n/a', 'yes', 'disabled', 'no', 'bshyman', 1, 'branching attempt');

\echo ''
\echo '--- ledger keeps both rows (expect: 2) ---'
SELECT count(*) AS rows_in_ledger FROM intake_records;

\echo ''
\echo '--- intake_current shows only the correction (expect: 1 row, health 88) ---'
SELECT id, serial, battery_health AS health, correction_note FROM intake_current;

\echo ''
\echo '--- drafts remain fully mutable (expect: SUCCESS) ---'
INSERT INTO intake_drafts (started_by, identifier, payload)
VALUES ('bshyman', 'Mac15,6', '{"step":1}') RETURNING id, step, identifier;
UPDATE intake_drafts SET step = 4 WHERE started_by = 'bshyman';
SELECT step, (updated_at > created_at) AS touch_trigger_fired FROM intake_drafts;
DELETE FROM intake_drafts WHERE started_by = 'bshyman';
SELECT count(*) AS drafts_after_delete FROM intake_drafts;

RESET SESSION AUTHORIZATION;
