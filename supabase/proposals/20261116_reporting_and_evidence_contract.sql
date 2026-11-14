-- REVIEW PROPOSAL ONLY. Do not apply to production.
-- Dependencies: states/state_id columns, state-scoped can_access_lga(), app roles,
-- existing reports/report_shares/campaign_evidence tables and Supabase Storage.
-- Must be tested from a known migration ledger in the isolated test project.

BEGIN;

-- Existing report rows contain metadata only. Persist the narrative separately
-- from operational rows and identify state-level reports explicitly.
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS state_id uuid REFERENCES public.states(id),
  ADD COLUMN IF NOT EXISTS content jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Derive state only where the existing LGA foreign key provides an exact
-- mapping. Do not guess state assignments for historical state-level reports.
UPDATE public.reports AS report
SET state_id = lga.state_id
FROM public.lgas AS lga
WHERE report.lga_id = lga.id
  AND report.state_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.reports
    WHERE lga_id IS NULL
      AND state_id IS NULL
      AND report_type IN ('state_monthly', 'consolidated_monthly')
  ) THEN
    RAISE EXCEPTION 'Map historical state reports before applying state reporting policies';
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS reports_state_period_idx
  ON public.reports (state_id, period_start DESC, status);

-- Replace role-only supervisor reads/writes. Boss obtains data only via the
-- aggregate/report archive RPCs below.
DROP POLICY IF EXISTS reports_access ON public.reports;
DROP POLICY IF EXISTS reports_create ON public.reports;
DROP POLICY IF EXISTS reports_supervisor_update ON public.reports;
DROP POLICY IF EXISTS reports_state_read ON public.reports;
DROP POLICY IF EXISTS reports_insert_scoped ON public.reports;
DROP POLICY IF EXISTS reports_update_lifecycle ON public.reports;

CREATE POLICY reports_state_read ON public.reports FOR SELECT TO authenticated
USING (
  (lga_id IS NOT NULL AND public.can_access_lga(lga_id))
  OR (lga_id IS NULL AND state_id = (SELECT p.state_id FROM public.profiles p WHERE p.id = auth.uid())
      AND public.current_app_role() IN ('state_coordinator','senior_supervisor'))
);

CREATE POLICY reports_insert_scoped ON public.reports FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND reviewed_by IS NULL AND reviewed_at IS NULL
  AND (
    (public.current_app_role() = 'lga_coordinator' AND report_type = 'lga_monthly'
      AND lga_id IS NOT NULL AND state_id IS NULL AND public.can_access_lga(lga_id)
      AND status = 'draft')
    OR
    (public.current_app_role() = 'state_coordinator' AND report_type = 'state_monthly'
      AND lga_id IS NULL AND state_id = (SELECT p.state_id FROM public.profiles p WHERE p.id = auth.uid())
      AND status = 'draft')
    OR
    (public.current_app_role() = 'senior_supervisor' AND report_type = 'consolidated_monthly'
      AND lga_id IS NULL AND state_id = (SELECT p.state_id FROM public.profiles p WHERE p.id = auth.uid())
      AND status = 'draft')
  )
);

CREATE POLICY reports_update_lifecycle ON public.reports FOR UPDATE TO authenticated
USING (
  (created_by = auth.uid() AND status IN ('draft','returned')
    AND ((lga_id IS NOT NULL AND public.can_access_lga(lga_id))
      OR (state_id = (SELECT p.state_id FROM public.profiles p WHERE p.id = auth.uid())
          AND public.current_app_role() IN ('state_coordinator','senior_supervisor'))))
  OR (lga_id IS NOT NULL AND public.can_access_lga(lga_id)
      AND public.current_app_role() IN ('state_coordinator','senior_supervisor')
      AND status = 'submitted')
  OR (state_id = (SELECT p.state_id FROM public.profiles p WHERE p.id = auth.uid())
      AND public.current_app_role() = 'senior_supervisor' AND status = 'submitted')
)
WITH CHECK (
  (created_by = auth.uid() AND reviewed_by IS NULL AND reviewed_at IS NULL
    AND status IN ('draft','returned','submitted')
    AND ((lga_id IS NOT NULL AND public.can_access_lga(lga_id))
      OR (state_id = (SELECT p.state_id FROM public.profiles p WHERE p.id = auth.uid())
          AND public.current_app_role() IN ('state_coordinator','senior_supervisor'))))
  OR (lga_id IS NOT NULL AND public.can_access_lga(lga_id)
      AND public.current_app_role() IN ('state_coordinator','senior_supervisor')
      AND status IN ('returned','approved') AND reviewed_by = auth.uid() AND reviewed_at IS NOT NULL)
  OR (state_id = (SELECT p.state_id FROM public.profiles p WHERE p.id = auth.uid())
      AND public.current_app_role() = 'senior_supervisor'
      AND status IN ('returned','approved') AND reviewed_by = auth.uid() AND reviewed_at IS NOT NULL)
);

-- Remove remaining role-only campaign access from the campaign migrations.
DROP POLICY IF EXISTS campaign_settings_supervisor_insert ON public.campaign_settings;
DROP POLICY IF EXISTS campaign_settings_supervisor_update ON public.campaign_settings;
-- The initial campaign migration used one permissive FOR ALL policy. Remove
-- it as well or PostgreSQL combines it with the scoped policies below using OR.
DROP POLICY IF EXISTS campaign_settings_supervisor_write ON public.campaign_settings;
CREATE POLICY campaign_settings_supervisor_insert ON public.campaign_settings FOR INSERT TO authenticated
WITH CHECK (public.current_app_role() IN ('state_coordinator','senior_supervisor') AND public.can_access_lga(lga_id));
CREATE POLICY campaign_settings_supervisor_update ON public.campaign_settings FOR UPDATE TO authenticated
USING (public.current_app_role() IN ('state_coordinator','senior_supervisor') AND public.can_access_lga(lga_id))
WITH CHECK (public.current_app_role() IN ('state_coordinator','senior_supervisor') AND public.can_access_lga(lga_id));

DROP POLICY IF EXISTS supervision_reviews_supervisor_insert ON public.supportive_supervision_reviews;
CREATE POLICY supervision_reviews_state_insert ON public.supportive_supervision_reviews FOR INSERT TO authenticated
WITH CHECK (public.current_app_role() IN ('state_coordinator','senior_supervisor') AND reviewer_id=auth.uid() AND public.can_access_lga(lga_id));

DROP POLICY IF EXISTS campaign_audit_read ON public.campaign_audit_events;
CREATE POLICY campaign_audit_state_read ON public.campaign_audit_events FOR SELECT TO authenticated
USING (lga_id IS NOT NULL AND public.can_access_lga(lga_id));

CREATE OR REPLACE FUNCTION public.enforce_supervision_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE visit_lga uuid;
BEGIN
  IF public.current_app_role() NOT IN ('state_coordinator','senior_supervisor') OR auth.uid() IS NULL
     OR NEW.reviewer_id IS DISTINCT FROM auth.uid() OR NOT public.can_access_lga(NEW.lga_id) THEN
    RAISE EXCEPTION 'Review must be made by a supervisor assigned to the visit state' USING ERRCODE='42501';
  END IF;
  SELECT lga_id INTO visit_lga FROM public.supportive_supervision_visits WHERE id=NEW.visit_id;
  IF visit_lga IS NULL OR visit_lga IS DISTINCT FROM NEW.lga_id THEN RAISE EXCEPTION 'Review and visit must belong to the same LGA' USING ERRCODE='23514'; END IF;
  IF length(trim(NEW.review_note))=0 THEN RAISE EXCEPTION 'A review note is required' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_report_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET row_security = off AS $$
DECLARE actor_role text := public.current_app_role()::text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by <> auth.uid() OR NEW.status <> 'draft'::public.report_status THEN
      RAISE EXCEPTION 'Reports must be created as drafts by the authenticated author' USING ERRCODE='42501';
    END IF;
    IF actor_role = 'lga_coordinator' THEN
      IF NEW.report_type <> 'lga_monthly' OR NEW.lga_id IS NULL OR NEW.state_id IS NOT NULL OR NOT public.can_access_lga(NEW.lga_id) THEN
        RAISE EXCEPTION 'LGA report must belong to the assigned LGA' USING ERRCODE='42501';
      END IF;
    ELSIF actor_role IN ('state_coordinator','senior_supervisor') THEN
      IF NEW.lga_id IS NOT NULL OR NEW.state_id IS DISTINCT FROM (SELECT p.state_id FROM public.profiles p WHERE p.id=auth.uid()) THEN
        RAISE EXCEPTION 'State report must belong to the assigned state' USING ERRCODE='42501';
      END IF;
    ELSE RAISE EXCEPTION 'Role cannot create reports' USING ERRCODE='42501'; END IF;
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id OR NEW.report_type <> OLD.report_type OR NEW.lga_id IS DISTINCT FROM OLD.lga_id
     OR NEW.state_id IS DISTINCT FROM OLD.state_id OR NEW.created_by <> OLD.created_by
     OR NEW.period_end < NEW.period_start THEN
    RAISE EXCEPTION 'Report identity and period are immutable after creation' USING ERRCODE='42501';
  END IF;
  IF OLD.created_by = auth.uid() AND actor_role IN ('lga_coordinator','state_coordinator','senior_supervisor')
     AND OLD.status IN ('draft','returned') AND NEW.status IN ('draft','submitted') THEN
    IF NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL THEN RAISE EXCEPTION 'Authors cannot set review fields' USING ERRCODE='42501'; END IF;
    RETURN NEW;
  END IF;
  IF actor_role IN ('state_coordinator','senior_supervisor') AND OLD.status='submitted'
     AND NEW.status IN ('returned','approved') AND NEW.reviewed_by=auth.uid() AND NEW.reviewed_at IS NOT NULL THEN
    IF OLD.created_by = auth.uid() THEN
      RAISE EXCEPTION 'A report author cannot approve or return their own report' USING ERRCODE='42501';
    END IF;
    IF NEW.content IS DISTINCT FROM OLD.content OR NEW.period_start IS DISTINCT FROM OLD.period_start
       OR NEW.period_end IS DISTINCT FROM OLD.period_end OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Reviewers cannot alter submitted report content or authorship' USING ERRCODE='42501';
    END IF;
    IF NOT ((NEW.lga_id IS NOT NULL AND public.can_access_lga(NEW.lga_id)) OR NEW.state_id=(SELECT p.state_id FROM public.profiles p WHERE p.id=auth.uid())) THEN
      RAISE EXCEPTION 'Report is outside the reviewer state' USING ERRCODE='42501';
    END IF;
    IF NEW.feedback IS NULL OR length(trim(NEW.feedback))=0 THEN RAISE EXCEPTION 'A report review note is required' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invalid report lifecycle operation' USING ERRCODE='42501';
END;
$$;

DROP TRIGGER IF EXISTS reports_enforce_write ON public.reports;
CREATE TRIGGER reports_enforce_write BEFORE INSERT OR UPDATE ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.enforce_report_write();

-- Sharing is Senior Supervisor-only, same-state, and approved-report-only.
CREATE OR REPLACE FUNCTION public.create_report_share(
  target_report_id uuid, target_recipient_label text, target_expires_at timestamptz
) RETURNS TABLE (share_id uuid, token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET row_security = off AS $$
DECLARE raw_token text := encode(extensions.gen_random_bytes(32), 'hex');
DECLARE actor_state uuid;
BEGIN
  IF public.current_app_role() <> 'senior_supervisor' THEN RAISE EXCEPTION 'Only Senior Supervisors may share approved reports' USING ERRCODE='42501'; END IF;
  SELECT state_id INTO actor_state FROM public.profiles WHERE id=auth.uid();
  IF target_expires_at <= now() OR length(trim(target_recipient_label))=0 THEN RAISE EXCEPTION 'Valid recipient and future expiry are required' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.reports r WHERE r.id=target_report_id AND r.status='approved' AND r.state_id=actor_state) THEN
    RAISE EXCEPTION 'Only an approved report from the assigned state can be shared' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.report_shares(report_id,recipient_label,created_by,token_hash,token_hint,expires_at)
  VALUES(target_report_id,target_recipient_label,auth.uid(),extensions.digest(raw_token,'sha256'),left(raw_token,8),target_expires_at)
  RETURNING id INTO share_id;
  token := raw_token; RETURN NEXT;
END; $$;

CREATE OR REPLACE FUNCTION public.revoke_report_share(target_share_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET row_security = off AS $$
DECLARE owner_state uuid;
BEGIN
  IF public.current_app_role() <> 'senior_supervisor' THEN RAISE EXCEPTION 'Only Senior Supervisors may revoke shares' USING ERRCODE='42501'; END IF;
  SELECT p.state_id INTO owner_state FROM public.profiles p WHERE p.id=auth.uid();
  UPDATE public.report_shares s SET revoked_at=now()
  FROM public.reports r WHERE s.id=target_share_id AND s.report_id=r.id AND r.state_id=owner_state AND s.revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Share not found, already revoked, or outside assigned state' USING ERRCODE='42501'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.revoke_report_share(uuid) FROM PUBLIC,anon;

-- Recipient redemption: the opaque, one-time-delivered token is hashed before
-- lookup. The function exposes approved report content only while the share is
-- active and unexpired; it never returns storage paths or operational rows.
CREATE OR REPLACE FUNCTION public.get_shared_report(target_token text)
RETURNS TABLE(report_type text,state_name text,lga_name text,period_start date,period_end date,
  approved_at timestamptz,content jsonb)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' SET row_security = off AS $$
  SELECT r.report_type,st.name,l.name,r.period_start,r.period_end,r.reviewed_at,r.content
  FROM public.report_shares s
  JOIN public.reports r ON r.id=s.report_id
  LEFT JOIN public.states st ON st.id=COALESCE(r.state_id,(SELECT lg.state_id FROM public.lgas lg WHERE lg.id=r.lga_id))
  LEFT JOIN public.lgas l ON l.id=r.lga_id
  WHERE target_token ~ '^[0-9a-f]{64}$'
    AND s.token_hash=extensions.digest(target_token,'sha256')
    AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp()
    AND r.status='approved'
$$;
REVOKE ALL ON FUNCTION public.get_shared_report(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_report(text) TO anon,authenticated;

DROP POLICY IF EXISTS report_shares_supervisor_read ON public.report_shares;
DROP POLICY IF EXISTS report_shares_supervisor_update ON public.report_shares;
CREATE POLICY report_shares_senior_read ON public.report_shares FOR SELECT TO authenticated
USING (public.current_app_role()='senior_supervisor' AND EXISTS (
  SELECT 1 FROM public.reports r WHERE r.id=report_id AND r.state_id=(SELECT p.state_id FROM public.profiles p WHERE p.id=auth.uid())
));
REVOKE INSERT, UPDATE, DELETE ON public.report_shares FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_report_share(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_report_share(uuid,text,timestamptz) TO authenticated;

-- Boss sees aggregate results and approved archive rows only; direct reports
-- and operational-table access remain denied.
CREATE OR REPLACE FUNCTION public.boss_lga_comparisons()
RETURNS TABLE(state_name text,lga_id uuid,lga_name text,task_total bigint,task_completed bigint,
  working_days_approved bigint,campaign_checkins bigint,readiness_reports bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' SET row_security = off AS $$
BEGIN
  IF public.current_app_role() <> 'boss' THEN RAISE EXCEPTION 'Boss reporting access required' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT st.name,l.id,l.name,
    (SELECT count(*) FROM public.tasks t WHERE t.lga_id=l.id),
    (SELECT count(*) FROM public.tasks t WHERE t.lga_id=l.id AND t.status='completed'),
    (SELECT count(*) FROM public.working_day_records w WHERE w.lga_id=l.id AND w.status='approved'),
    (SELECT count(*) FROM public.campaign_checkins c WHERE c.lga_id=l.id),
    (SELECT count(*) FROM public.campaign_readiness_reports rr WHERE rr.lga_id=l.id)
  FROM public.lgas l JOIN public.states st ON st.id=l.state_id ORDER BY st.name,l.name;
END; $$;

CREATE OR REPLACE FUNCTION public.boss_report_archive()
RETURNS TABLE(report_id uuid,state_name text,lga_name text,report_type text,period_start date,period_end date,
  status text,created_at timestamptz,reviewed_at timestamptz,content jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' SET row_security = off AS $$
BEGIN
  IF public.current_app_role() <> 'boss' THEN RAISE EXCEPTION 'Boss reporting access required' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT r.id,st.name,l.name,r.report_type,r.period_start,r.period_end,r.status::text,r.created_at,r.reviewed_at,r.content
  FROM public.reports r LEFT JOIN public.states st ON st.id=COALESCE(r.state_id,(SELECT lg.state_id FROM public.lgas lg WHERE lg.id=r.lga_id))
  LEFT JOIN public.lgas l ON l.id=r.lga_id WHERE r.status='approved' ORDER BY r.period_end DESC,r.created_at DESC;
END; $$;
REVOKE ALL ON FUNCTION public.boss_lga_comparisons() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.boss_report_archive() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.boss_lga_comparisons() TO authenticated;
GRANT EXECUTE ON FUNCTION public.boss_report_archive() TO authenticated;

-- Private evidence storage. Paths must begin with the target LGA UUID.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('campaign-evidence','campaign-evidence',false,10485760,ARRAY['image/jpeg','image/png','application/pdf'])
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE existing_bucket storage.buckets%ROWTYPE;
BEGIN
  SELECT * INTO existing_bucket FROM storage.buckets WHERE id='campaign-evidence';
  IF NOT FOUND
     OR existing_bucket.public IS DISTINCT FROM false
     OR existing_bucket.file_size_limit IS DISTINCT FROM 10485760::bigint
     OR existing_bucket.allowed_mime_types IS DISTINCT FROM ARRAY['image/jpeg','image/png','application/pdf']::text[] THEN
    RAISE EXCEPTION 'Existing campaign-evidence bucket configuration requires review; no bucket settings were overwritten';
  END IF;
END;
$$;

DROP POLICY IF EXISTS campaign_evidence_storage_read ON storage.objects;
DROP POLICY IF EXISTS campaign_evidence_storage_insert ON storage.objects;
CREATE POLICY campaign_evidence_storage_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='campaign-evidence' AND split_part(name,'/',1) ~* '^[0-9a-f-]{36}$'
  AND EXISTS (SELECT 1 FROM public.lgas l WHERE l.id::text=split_part(name,'/',1) AND public.can_access_lga(l.id)));
CREATE POLICY campaign_evidence_storage_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='campaign-evidence' AND public.current_app_role()='lga_coordinator'
  AND split_part(name,'/',1) ~* '^[0-9a-f-]{36}$'
  AND split_part(name,'/',2)=auth.uid()::text
  AND EXISTS (SELECT 1 FROM public.lgas l WHERE l.id::text=split_part(name,'/',1) AND public.can_access_lga(l.id)));
CREATE POLICY campaign_evidence_storage_delete_own_orphan ON storage.objects FOR DELETE TO authenticated
USING (bucket_id='campaign-evidence' AND split_part(name,'/',2)=auth.uid()::text
  AND split_part(name,'/',1) ~* '^[0-9a-f-]{36}$'
  AND EXISTS (SELECT 1 FROM public.lgas l WHERE l.id::text=split_part(name,'/',1) AND public.can_access_lga(l.id))
  AND NOT EXISTS (SELECT 1 FROM public.task_evidence e WHERE e.storage_path=name));

COMMIT;
