-- Manual admin enrollment (Registration ID -> enrollments direct insert, see
-- AdminStudents.tsx EnrollStudentForm) did not auto-confirm the student's
-- email the way payment_request approval does. This adds a trigger on
-- enrollments so ANY new enrollment row (manual or via payment approval)
-- auto-confirms the student's email, closing that gap.

CREATE OR REPLACE FUNCTION public.handle_enrollment_insert_confirm_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = NEW.profile_id AND email_confirmed_at IS NULL;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enrollment_insert_confirm_email ON public.enrollments;

CREATE TRIGGER trg_enrollment_insert_confirm_email
    AFTER INSERT ON public.enrollments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_enrollment_insert_confirm_email();
