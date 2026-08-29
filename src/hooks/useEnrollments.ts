import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useEnrollments = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["enrollments", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const now = new Date().toISOString();

      const { data: enrollments, error } = await supabase
        .from("enrollments")
        .select(`
          *,
          course:courses(*)
        `)
        .eq("profile_id", user.id);

      if (error) throw error;

      // Filter out expired enrollments
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const activeEnrollments = (enrollments || []).filter((e: any) => {
        if (!e.expires_at) return true; // No expiry = always active
        return e.expires_at > now;      // Only active if not expired
      });

      // Handle Linked/Extra Courses (bonus courses from linked_course_ids).
      // Resolved PER direct enrollment (not globally flattened) so "My Courses"
      // can show, under each main course, exactly which bonus courses it unlocked.
      const directIds = new Set(activeEnrollments.map((e: any) => e.course_id));
      const allLinkedIds = new Set<string>();
      const bonusIdsByRoot = new Map<string, Set<string>>(); // root course_id -> set of bonus course ids it unlocked

      const resolveLinkedForRoot = async (rootId: string, idsToResolve: string[], seen: Set<string>) => {
          if (idsToResolve.length === 0) return;

          const { data: courses } = await supabase
              .from("courses")
              .select("id, linked_course_ids")
              .in("id", idsToResolve);

          if (!courses) return;

          const nextIds: string[] = [];
          courses.forEach((c: any) => {
              if (c.linked_course_ids && Array.isArray(c.linked_course_ids)) {
                  c.linked_course_ids.forEach((id: string) => {
                      if (!directIds.has(id) && !seen.has(id)) {
                          seen.add(id);
                          allLinkedIds.add(id);
                          if (!bonusIdsByRoot.has(rootId)) bonusIdsByRoot.set(rootId, new Set());
                          bonusIdsByRoot.get(rootId)!.add(id);
                          nextIds.push(id);
                      }
                  });
              }
          });

          if (nextIds.length > 0) {
              await resolveLinkedForRoot(rootId, nextIds, seen);
          }
      };

      await Promise.all(
          Array.from(directIds).map((rootId) => resolveLinkedForRoot(rootId as string, [rootId as string], new Set([rootId as string])))
      );

      if (allLinkedIds.size > 0) {
          const { data: extraCourses } = await supabase
              .from("courses")
              .select("*")
              .in("id", Array.from(allLinkedIds));

          if (extraCourses) {
              const extraCourseById = new Map(extraCourses.map((c: any) => [c.id, c]));
              const directCourseById = new Map(activeEnrollments.map((e: any) => [e.course_id, e.course]));

              // Attach each direct enrollment's own bonus course list (id + name only).
              const enrichedDirect = activeEnrollments.map((e: any) => {
                  const bonusIds = bonusIdsByRoot.get(e.course_id) || new Set<string>();
                  const bonusCourses = Array.from(bonusIds)
                      .map((id) => extraCourseById.get(id))
                      .filter(Boolean)
                      .map((c: any) => ({ id: c.id, name: c.name }));
                  return { ...e, bonus_courses: bonusCourses };
              });

              // Reverse map: bonus course id -> set of root course ids that unlocked it.
              // Used so a bonus course inherits full-access toggles (readymade_full_access,
              // archive_full_access) from whichever root/main course granted it — a bonus
              // course itself almost never has these flags set directly.
              const rootsByBonusId = new Map<string, Set<string>>();
              bonusIdsByRoot.forEach((bonusSet, rootId) => {
                  bonusSet.forEach((bonusId) => {
                      if (!rootsByBonusId.has(bonusId)) rootsByBonusId.set(bonusId, new Set());
                      rootsByBonusId.get(bonusId)!.add(rootId);
                  });
              });

              const extraEnrollments = extraCourses.map(c => {
                  const rootIds = Array.from(rootsByBonusId.get(c.id) || []);
                  const inheritedReadymadeFullAccess = rootIds.some(
                      (rid) => directCourseById.get(rid)?.readymade_full_access
                  );
                  const inheritedArchiveFullAccess = rootIds.some(
                      (rid) => directCourseById.get(rid)?.archive_full_access
                  );
                  return {
                      id: `virtual-${c.id}`, // Virtual ID
                      course_id: c.id,
                      profile_id: user.id,
                      created_at: new Date().toISOString(),
                      expires_at: null, // Bonus courses inherit from parent (no separate expiry)
                      course: {
                          ...c,
                          // Bonus course unlocks fully if EITHER its own flag OR any root
                          // course that granted it has the flag on.
                          readymade_full_access: c.readymade_full_access || inheritedReadymadeFullAccess,
                          archive_full_access: c.archive_full_access || inheritedArchiveFullAccess,
                      },
                      is_extra: true,       // Mark as bonus/extra course
                      is_bonus: true,       // Explicit bonus flag
                  };
              });
              return [...enrichedDirect, ...extraEnrollments] as any[];
          }
      }

      return activeEnrollments || [];
    },
    enabled: !!user,
    // Keep enrollment/course data (including readymade_full_access) fresh so
    // access granted by an admin while a student's tab is already open
    // reflects without requiring a manual reload.
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 60000,
    staleTime: 30000,
  });
};

/**
 * Returns only the directly-enrolled (non-bonus) course IDs.
 * Used for community links, dashboard "My Courses", etc.
 */
export const useDirectEnrollments = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["direct-enrollments", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const now = new Date().toISOString();

      const { data: enrollments, error } = await supabase
        .from("enrollments")
        .select(`
          *,
          course:courses(*)
        `)
        .eq("profile_id", user.id);

      if (error) throw error;

      // Only return active, direct (non-bonus) enrollments
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (enrollments || []).filter((e: any) => {
        if (!e.expires_at) return true;
        return e.expires_at > now;
      });
    },
    enabled: !!user,
  });
};
