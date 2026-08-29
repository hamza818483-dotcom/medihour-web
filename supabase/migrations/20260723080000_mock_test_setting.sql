-- "Unlimited Mock Test" tile visibility toggle, controlled from an admin
-- setting (reuses the existing app_settings key/value store + get_app_setting
-- RPC — no new table needed). Defaults to hidden until an admin turns it on.

INSERT INTO public.app_settings (key, value)
VALUES ('mock_test_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
