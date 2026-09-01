-- Add usage_limit / used_count / uses_left to get_special_discounts so the
-- coupon card on the public course page can show remaining uses.
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
            'special_discount_deadline', pc.special_discount_deadline,
            'usage_limit', pc.usage_limit,
            'used_count', COALESCE(pc.used_count, 0),
            'uses_left', CASE WHEN pc.usage_limit IS NULL THEN NULL ELSE pc.usage_limit - COALESCE(pc.used_count, 0) END
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
