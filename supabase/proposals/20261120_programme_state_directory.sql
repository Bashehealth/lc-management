-- PROPOSAL ONLY: adds the 15 user-specified programme states.
-- Existing matching IDs and foreign-key relationships are preserved.
-- The existing Yobe row (NG-YO) may be renamed to the requested display name.

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('NG-YO','Yobe State'), ('NG-BO','Borno State'), ('NG-BA','Bauchi State'),
      ('NG-GO','Gombe State'), ('NG-AD','Adamawa State'), ('NG-JI','Jigawa State'),
      ('NG-KN','Kano State'), ('NG-KD','Kaduna State'), ('NG-KT','Katsina State'),
      ('NG-ZA','Zamfara State'), ('NG-SO','Sokoto State'), ('NG-KE','Kebbi State'),
      ('NG-NI','Niger State'), ('NG-NA','Nasarawa State'), ('NG-KO','Kogi State')
    ) AS expected(code, name)
    JOIN public.states existing ON lower(existing.name) = lower(expected.name)
    WHERE existing.code <> expected.code
  ) THEN
    RAISE EXCEPTION 'A programme state name is already assigned to a different state code; reconcile manually before applying.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('NG-BO','Borno State'), ('NG-BA','Bauchi State'), ('NG-GO','Gombe State'),
      ('NG-AD','Adamawa State'), ('NG-JI','Jigawa State'), ('NG-KN','Kano State'),
      ('NG-KD','Kaduna State'), ('NG-KT','Katsina State'), ('NG-ZA','Zamfara State'),
      ('NG-SO','Sokoto State'), ('NG-KE','Kebbi State'), ('NG-NI','Niger State'),
      ('NG-NA','Nasarawa State'), ('NG-KO','Kogi State')
    ) AS expected(code, name)
    JOIN public.states existing ON existing.code = expected.code
    WHERE lower(existing.name) <> lower(expected.name)
  ) THEN
    RAISE EXCEPTION 'A programme state code is already assigned to a different name; reconcile manually before applying.';
  END IF;
END;
$guard$;

INSERT INTO public.states (code, name, country_code, is_active)
VALUES
  ('NG-YO','Yobe State','NG',true), ('NG-BO','Borno State','NG',true),
  ('NG-BA','Bauchi State','NG',true), ('NG-GO','Gombe State','NG',true),
  ('NG-AD','Adamawa State','NG',true), ('NG-JI','Jigawa State','NG',true),
  ('NG-KN','Kano State','NG',true), ('NG-KD','Kaduna State','NG',true),
  ('NG-KT','Katsina State','NG',true), ('NG-ZA','Zamfara State','NG',true),
  ('NG-SO','Sokoto State','NG',true), ('NG-KE','Kebbi State','NG',true),
  ('NG-NI','Niger State','NG',true), ('NG-NA','Nasarawa State','NG',true),
  ('NG-KO','Kogi State','NG',true)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    country_code = EXCLUDED.country_code,
    is_active = true;
