-- Meta (Facebook/Instagram) Ads tracking support.
--
-- 1. Adds columns to payment_requests to store the browser-generated
--    event_id (for CAPI/Pixel dedup), the final approved purchase amount,
--    UTM attribution, and Meta browser cookies (fbp/fbc) for match quality.
-- 2. Adds UTM columns to profiles for registration-time attribution.
-- 3. Adds a trigger that fires the `meta-capi` edge function via pg_net
--    the moment a payment_requests row's status transitions to 'approved'
--    (regardless of which code path did it — RPC, insert-trigger, or a
--    direct UPDATE), guaranteeing Purchase is only ever sent for a genuine
--    admin-verified payment, never from a client just visiting a "success"
--    page.
--
-- The edge function URL + a shared secret are read from Supabase Vault-like
-- app settings (set via `ALTER DATABASE ... SET` is not available on
-- managed Supabase, so we use a small settings table instead).

CREATE TABLE IF NOT EXISTS public.app_settings (
    key text PRIMARY KEY,
    value text
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Only service_role / definer functions may read this; no public policies.
CREATE POLICY app_settings_admin_all ON public.app_settings
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

ALTER TABLE public.payment_requests
    ADD COLUMN IF NOT EXISTS event_id text,
    ADD COLUMN IF NOT EXISTS amount_final numeric(10,2),
    ADD COLUMN IF NOT EXISTS utm_source text,
    ADD COLUMN IF NOT EXISTS utm_medium text,
    ADD COLUMN IF NOT EXISTS utm_campaign text,
    ADD COLUMN IF NOT EXISTS utm_content text,
    ADD COLUMN IF NOT EXISTS utm_term text,
    ADD COLUMN IF NOT EXISTS fbp text,
    ADD COLUMN IF NOT EXISTS fbc text,
    ADD COLUMN IF NOT EXISTS capi_sent_at timestamptz;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS utm_source text,
    ADD COLUMN IF NOT EXISTS utm_medium text,
    ADD COLUMN IF NOT EXISTS utm_campaign text,
    ADD COLUMN IF NOT EXISTS utm_content text,
    ADD COLUMN IF NOT EXISTS utm_term text;

-- Extend handle_new_user to also persist UTM attribution captured at
-- signup time (passed in from the client via auth signUp options.data).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    registration_id,
    full_name,
    father_name,
    mother_name,
    phone,
    hsc_batch,
    college_name,
    ssc_gpa,
    hsc_gpa,
    is_second_timer,
    gender,
    extra_time_multiplier,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term
  )
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'phone', new.phone, new.id::text),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'father_name',
    new.raw_user_meta_data->>'mother_name',
    COALESCE(new.raw_user_meta_data->>'phone', new.phone),
    new.raw_user_meta_data->>'hsc_batch',
    new.raw_user_meta_data->>'college_name',
    COALESCE(NULLIF(new.raw_user_meta_data->>'ssc_gpa', '')::numeric, 0),
    COALESCE(NULLIF(new.raw_user_meta_data->>'hsc_gpa', '')::numeric, 0),
    COALESCE(NULLIF(new.raw_user_meta_data->>'is_second_timer', '')::boolean, false),
    new.raw_user_meta_data->>'gender',
    1,
    new.raw_user_meta_data->>'utm_source',
    new.raw_user_meta_data->>'utm_medium',
    new.raw_user_meta_data->>'utm_campaign',
    new.raw_user_meta_data->>'utm_content',
    new.raw_user_meta_data->>'utm_term'
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    father_name = EXCLUDED.father_name,
    mother_name = EXCLUDED.mother_name,
    phone = EXCLUDED.phone,
    hsc_batch = EXCLUDED.hsc_batch,
    college_name = EXCLUDED.college_name,
    ssc_gpa = EXCLUDED.ssc_gpa,
    hsc_gpa = EXCLUDED.hsc_gpa,
    is_second_timer = EXCLUDED.is_second_timer,
    gender = EXCLUDED.gender,
    utm_source = COALESCE(public.profiles.utm_source, EXCLUDED.utm_source),
    utm_medium = COALESCE(public.profiles.utm_medium, EXCLUDED.utm_medium),
    utm_campaign = COALESCE(public.profiles.utm_campaign, EXCLUDED.utm_campaign),
    utm_content = COALESCE(public.profiles.utm_content, EXCLUDED.utm_content),
    utm_term = COALESCE(public.profiles.utm_term, EXCLUDED.utm_term);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.notify_meta_capi_on_approval_from_row(p_row public.payment_requests) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_course_name TEXT;
    v_course_price NUMERIC;
    v_email TEXT;
    v_endpoint TEXT;
    v_amount NUMERIC;
BEGIN
    SELECT value INTO v_endpoint FROM public.app_settings WHERE key = 'meta_capi_edge_url';
    IF v_endpoint IS NULL THEN
        RETURN;
    END IF;

    SELECT name, price INTO v_course_name, v_course_price FROM public.courses WHERE id = p_row.course_id;
    SELECT email INTO v_email FROM auth.users WHERE id = p_row.profile_id;

    v_amount := COALESCE(p_row.amount_final, p_row.amount_sent, v_course_price, 0);

    UPDATE public.payment_requests
    SET amount_final = v_amount, capi_sent_at = now()
    WHERE id = p_row.id;

    PERFORM net.http_post(
        url := v_endpoint,
        body := jsonb_build_object(
            'event_name', 'Purchase',
            'event_id', p_row.event_id,
            'user', jsonb_build_object(
                'email', v_email,
                'phone', p_row.phone,
                'fbp', p_row.fbp,
                'fbc', p_row.fbc
            ),
            'purchase', jsonb_build_object(
                'content_ids', jsonb_build_array(p_row.course_id),
                'content_name', v_course_name,
                'value', v_amount,
                'currency', 'BDT'
            ),
            'utm', jsonb_build_object(
                'utm_source', p_row.utm_source,
                'utm_medium', p_row.utm_medium,
                'utm_campaign', p_row.utm_campaign,
                'utm_content', p_row.utm_content,
                'utm_term', p_row.utm_term
            )
        ),
        headers := jsonb_build_object('Content-Type', 'application/json')
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_meta_capi_on_approval() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM 'approved' THEN
        RETURN NEW;
    END IF;
    IF OLD IS NOT NULL AND OLD.status = 'approved' THEN
        RETURN NEW; -- already sent once, don't double-fire on unrelated updates
    END IF;

    PERFORM public.notify_meta_capi_on_approval_from_row(NEW);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meta_capi_on_approval ON public.payment_requests;
CREATE TRIGGER trg_meta_capi_on_approval
    AFTER UPDATE ON public.payment_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_meta_capi_on_approval();

-- Also cover the "approved straight from insert" path (e.g. free/promo
-- 100%-off enrollments that are inserted with status already 'approved').
CREATE OR REPLACE FUNCTION public.notify_meta_capi_on_approved_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    IF NEW.status = 'approved' THEN
        PERFORM public.notify_meta_capi_on_approval_from_row(NEW);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meta_capi_on_approved_insert ON public.payment_requests;
CREATE TRIGGER trg_meta_capi_on_approved_insert
    AFTER INSERT ON public.payment_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_meta_capi_on_approved_insert();
