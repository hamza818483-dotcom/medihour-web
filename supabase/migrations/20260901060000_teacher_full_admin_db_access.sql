-- Grants teacher role the same DB-level (RLS) access as admin.
-- Most admin-only RLS policies call either is_admin() or
-- has_role(auth.uid(), 'admin'). Redefining both so 'admin' checks also
-- match 'teacher' makes teacher = admin everywhere without touching every
-- individual policy.

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'teacher')
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = _role
        OR (_role = 'admin' AND role = 'teacher')
      )
  );
$$;
