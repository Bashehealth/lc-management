-- Add a separate management approval role.
-- Existing application roles and permissions remain unchanged.

ALTER TYPE public.app_role
ADD VALUE IF NOT EXISTS 'management_approver';
