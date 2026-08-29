-- Coupon System Updates: Multi-course support, case-insensitive matching, special discount text, usage count fix

-- 1. Add new columns to promo_codes
ALTER TABLE public.promo_codes 
  ADD COLUMN IF NOT EXISTS course_ids text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS special_discount_text text,
  ADD COLUMN IF NOT EXISTS special_discount_deadline timestamptz;

-- 2. Migrate existing course_id data to course_ids array
UPDATE public.promo_codes 
SET course_ids = ARRAY[course_id::text] 
WHERE course_id IS NOT NULL AND (course_ids IS NULL OR course_ids = '{}');

-- 3. Replace check_promo_code function with case-insensitive version + usage count increment
CREATE OR REPLACE FUNCTION public.check_promo_code(p_code text, p_course_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_promo record;
BEGIN
    -- Case-insensitive code matching, check both course_id (legacy) and course_ids (new)
    SELECT * INTO v_promo FROM public.promo_codes 
    WHERE LOWER(code) = LOWER(p_code) 
      AND is_active = true 
      AND (
        course_id IS NULL 
        OR course_id = p_course_id
        OR p_course_id::text = ANY(course_ids)
        OR course_ids = '{}'
        OR course_ids IS NULL
      );

    IF v_promo IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Invalid promo code');
    END IF;

    IF v_promo.usage_limit IS NOT NULL AND v_promo.used_count >= v_promo.usage_limit THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Promo code usage limit exceeded');
    END IF;

    -- Increment usage count
    UPDATE public.promo_codes SET used_count = COALESCE(used_count, 0) + 1 WHERE id = v_promo.id;

    RETURN jsonb_build_object(
        'valid', true,
        'discount_amount', v_promo.discount_amount,
        'discount_type', v_promo.discount_type,
        'id', v_promo.id,
        'code', v_promo.code
    );
END;
$$;

-- 4. Create RPC to get special discounts for a course
CREATE OR REPLACE FUNCTION public.get_special_discounts(p_course_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_result jsonb;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'code', pc.code,
            'discount_amount', pc.discount_amount,
            'discount_type', pc.discount_type,
            'special_discount_text', pc.special_discount_text,
            'special_discount_deadline', pc.special_discount_deadline
        )
    ) INTO v_result
    FROM public.promo_codes pc
    WHERE pc.is_active = true
      AND pc.special_discount_text IS NOT NULL
      AND pc.special_discount_text != ''
      AND (
        pc.course_id IS NULL
        OR pc.course_id = p_course_id
        OR p_course_id::text = ANY(pc.course_ids)
      )
      AND (pc.special_discount_deadline IS NULL OR pc.special_discount_deadline > NOW())
      AND (pc.usage_limit IS NULL OR pc.used_count < pc.usage_limit);

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
