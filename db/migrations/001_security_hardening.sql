-- =============================================================================
-- KRISHISETU 2.0 — PHASE 1.5 SECURITY HARDENING MIGRATION
-- Migration 001: Supabase / PostgreSQL Access Control & RLS Shield
-- =============================================================================
-- ARCHITECTURAL CONTEXT:
-- The KrishiSetu application exclusively accesses PostgreSQL via a Node.js
-- Express connection pool operating under the 'postgres' superuser/table-owner role.
-- The frontend client NEVER calls the Supabase Data API (PostgREST / GraphQL).
--
-- This migration:
-- 1. Revokes ALL table privileges from PostgREST roles ('anon', 'authenticated').
-- 2. Revokes ALL sequence privileges from 'anon' and 'authenticated'.
-- 3. Revokes ALL routine/function privileges in schema public from 'anon' and 'authenticated'.
-- 4. Alters DEFAULT PRIVILEGES for future tables, sequences, and routines.
-- 5. Enables Row Level Security (RLS) on all public tables WITHOUT FORCE ROW LEVEL SECURITY.
-- 6. Preserves backend 'postgres' role functionality (as table owner with BYPASSRLS).
-- 7. Contains ZERO destructive DROP, TRUNCATE, or DELETE statements.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- STEP 1: REVOKE EXISTING OBJECT PRIVILEGES FROM anon AND authenticated
-- -----------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- STEP 2: REVOKE DEFAULT PRIVILEGES FOR FUTURE OBJECTS IN SCHEMA public
-- -----------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- STEP 3: ENABLE ROW LEVEL SECURITY (RLS) ON ALL PUBLIC TABLES
-- Note: 'FORCE ROW LEVEL SECURITY' is intentionally NOT used. The backend connection
-- pool connects as table owner ('postgres') and continues normal operations, while
-- any unauthorized client accessing PostgREST directly defaults to complete DENY.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        RAISE NOTICE 'RLS successfully enabled on public.%', tbl;
    END LOOP;
END $$;

COMMIT;
