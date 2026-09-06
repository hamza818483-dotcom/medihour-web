-- E-Books feature: admin-managed downloadable books shown on a public page.
CREATE TABLE public.ebooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    image_url text,
    download_url text,
    original_price numeric,
    discount_price numeric,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.ebooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow admin full access to ebooks" ON public.ebooks USING ((
  SELECT public.is_admin() AS is_admin
  FROM public.profiles
  WHERE (profiles.id = auth.uid())
));

CREATE POLICY "Allow public read access to active ebooks" ON public.ebooks FOR SELECT USING (is_active = true);
