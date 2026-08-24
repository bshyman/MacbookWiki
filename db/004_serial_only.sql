-- Serial-only intake. Most of the fleet arrives broken — won't boot, MDM-locked,
-- password-walled — and those machines can't produce an identifier or lock
-- readings. Requiring them meant broken machines could never be committed and
-- piled up as drafts instead, invisible to every serial lookup.
--
-- NULL here means "not recorded", which is an honest, falsifiable claim. The
-- CHECK constraints stay: a value that IS provided must still be one of the
-- allowed ones (CHECK passes NULL by SQL semantics, no rewrite needed).
--
-- deriveBlockers() now stamps 'locks-unverified' on rows committed with missing
-- or unknown lock readings, so a machine can't silently look resale-ready.
--
-- Run as the owner (locally: your superuser; on Neon: neondb_owner).

BEGIN;

ALTER TABLE intake_records
  ALTER COLUMN identifier      DROP NOT NULL,
  ALTER COLUMN firmware_locked DROP NOT NULL,
  ALTER COLUMN os_reset        DROP NOT NULL,
  ALTER COLUMN activation_lock DROP NOT NULL,
  ALTER COLUMN mdm_enrolled    DROP NOT NULL;

-- The app now uppercases serials at commit, but two rows predate that
-- (C02FM5RHQ6l7, C02WM1SMHV2l) and the ledger can't be edited — so lookups
-- compare upper(serial), and this index keeps that cheap.
CREATE INDEX IF NOT EXISTS idx_intake_records_serial_upper
  ON intake_records (upper(serial));

COMMIT;
