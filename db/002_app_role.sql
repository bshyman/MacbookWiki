-- Least-privilege runtime role.
--
-- This is the layer that makes "append-only" structural rather than a
-- convention: macbook_app is never granted UPDATE or DELETE on intake_records,
-- so the application physically cannot mutate a committed row. It also doesn't
-- own the table, so it can't drop the triggers or alter the constraints.
--
-- Run as the owner:
--   psql -d <db> -v db_name=<db> -f db/002_app_role.sql
--
-- It prompts for the password. Don't pass one with -v — that puts a production
-- credential in your shell history and in the process table for anyone running ps.
--
-- On Neon, run this as neondb_owner. Neon reserves the neon_superuser role for
-- administration — the app must not connect as it.

\set ON_ERROR_STOP on

\if :{?app_password}
\else
\prompt 'Password for macbook_app: ' app_password
\endif

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'macbook_app') THEN
    CREATE ROLE macbook_app LOGIN;
  END IF;
END;
$$;

ALTER ROLE macbook_app WITH PASSWORD :'app_password';

GRANT CONNECT ON DATABASE :"db_name" TO macbook_app;
GRANT USAGE ON SCHEMA public TO macbook_app;

-- No object creation — the app applies no DDL.
REVOKE CREATE ON SCHEMA public FROM macbook_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM macbook_app;

-- Ledger: read and append only. The absent UPDATE/DELETE grants are the point.
GRANT SELECT, INSERT ON intake_records TO macbook_app;
REVOKE UPDATE, DELETE, TRUNCATE ON intake_records FROM macbook_app;

-- Same restriction reaches the view.
GRANT SELECT ON intake_current TO macbook_app;

-- Drafts are scratch space and stay fully mutable.
GRANT SELECT, INSERT, UPDATE, DELETE ON intake_drafts TO macbook_app;

-- PUBLIC grants would route around everything above.
REVOKE ALL ON intake_records FROM PUBLIC;
REVOKE ALL ON intake_drafts  FROM PUBLIC;
