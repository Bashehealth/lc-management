-- Run this migration first and commit it before the next migration.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dpm';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'boss';
