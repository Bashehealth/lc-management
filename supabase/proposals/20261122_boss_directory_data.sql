-- PROPOSAL ONLY. Apply only after reviewing on an isolated database.
-- Existing LGA activity is intentionally left unknown (NULL); no rows are
-- classified as active/inactive by assumption.
ALTER TABLE public.lgas ADD COLUMN IF NOT EXISTS is_active boolean;
COMMENT ON COLUMN public.lgas.is_active IS
  'Operational activity flag. NULL means not yet classified; populate only from an authorized programme roster.';

-- Separate contact data from the broadly referenced profile table. There are
-- no authenticated table grants or RLS policies; only an authorized reporting
-- RPC or a trusted administrative backend may read/write these values.
CREATE TABLE IF NOT EXISTS public.profile_contact_details (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone_number text CHECK (phone_number IS NULL OR length(trim(phone_number)) <= 40),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_contact_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_contact_details FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profile_contact_details TO service_role;
COMMENT ON TABLE public.profile_contact_details IS
  'Restricted contact details. Do not grant direct client access; expose only through narrowly authorized server functions.';
