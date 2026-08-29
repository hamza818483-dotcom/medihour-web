import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Save, ArrowUpDown, Loader2, ChevronLeft } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface CourseItemsManagerDialogProps {
  courseId: string | null;
  courseName: string;
  resourceType: "classes" | "exams";
  subjectFilter?: string | null;
  chapterFilter?: string | null;
  subChapterFilter?: string | null;
  onClose: () => void;
}

interface ItemBase {
  id: string;
  title: string;
  sort_order: number;
  course_id: string | null;
  shared_course_ids?: string[];
  archive_course_ids?: string[];
}

import { DraggableSortList } from "./DraggableSortList";

export function CourseItemsManagerDialog({ courseId, courseName, resourceType, subjectFilter, chapterFilter, subChapterFilter, onClose }: CourseItemsManagerDialogProps) {
  const [items, setItems] = useState<ItemBase[]>([]);
  const [isModified, setIsModified] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: fetchedItems, isLoading, isError } = useQuery({
    queryKey: ["admin-course-items", courseId, resourceType, subjectFilter, chapterFilter, subChapterFilter, courseName],
    queryFn: async () => {
      // Allow passing without courseId if we are managing global readymade/archive exams
      if (!courseId && courseName !== "Readymade Exams" && courseName !== "Archive Classes") return [];
      
      let query = supabase.from(resourceType).select("*");

      if (resourceType === "exams") {
          query = query.is("split_start", null);
      }

      if (courseId) {
          if (courseName === "Readymade Exams" && resourceType === "exams") {
              query = query.eq("is_readymade", true).or(`course_id.eq.${courseId},course_id.is.null,shared_course_ids.cs.{${courseId}},readymade_course_ids.cs.{${courseId}}`);
          } else {
              if (resourceType === 'classes') {
                  query = query.or(`course_id.eq.${courseId},shared_course_ids.cs.{${courseId}},archive_course_ids.cs.{${courseId}}`);
              } else {
                  query = query.or(`course_id.eq.${courseId},shared_course_ids.cs.{${courseId}},archive_course_ids.cs.{${courseId}},readymade_course_ids.cs.{${courseId}}`);
              }
          }
      } else {
          // Fallback if courseId is null but we're in specific global views
          if (courseName === "Readymade Exams" && resourceType === "exams") {
              query = query.eq("is_readymade", true);
          } else if (courseName === "Archive Classes" && resourceType === "classes") {
              // Can't effectively fetch "all archives" efficiently without a flag, but usually courseId is provided.
          }
      }

      if (subjectFilter) {
          query = query.contains("subject", [subjectFilter]);
      }
      if (chapterFilter) {
          query = query.eq("chapter", chapterFilter);
      }
      if (subChapterFilter) {
          if (courseName === "Readymade Exams") {
              query = query.eq("readymade_sub_chapter", subChapterFilter);
          } else {
              // Add other sub-chapter column mapping if needed for other contexts
              query = query.eq("sub_chapter", subChapterFilter);
          }
      }
      
      const { data, error } = await query;

      if (error) {
          console.error("Error fetching items:", error);
          throw error;
      }

      // Sort primarily by sort_order descending, then by creation date or id
      const sorted = (data as ItemBase[]).sort((a, b) => {
          const orderA = a.sort_order || 0;
          const orderB = b.sort_order || 0;
          return orderB - orderA; // Highest order first
      });

      // User instruction: shared/archive items should be at the bottom
      // So we will sort them first by primary (1) vs shared (0), then by sort_order
      const finalSorted = sorted.sort((a, b) => {
          const aIsPrimary = a.course_id === courseId ? 1 : 0;
          const bIsPrimary = b.course_id === courseId ? 1 : 0;
          if (aIsPrimary !== bIsPrimary) {
              return bIsPrimary - aIsPrimary; // Primary first
          }
          const orderA = a.sort_order || 0;
          const orderB = b.sort_order || 0;
          return orderB - orderA;
      });

      return finalSorted;
    },
    enabled: !!courseId || courseName === "Readymade Exams" || courseName === "Archive Classes",
  });

  useEffect(() => {
    if (fetchedItems) {
      setItems(fetchedItems);
      setIsModified(false);
    }
  }, [fetchedItems]);



  const saveOrderMutation = useMutation({
    mutationFn: async (orderedItems: ItemBase[]) => {
      // The first item gets the highest index, the last gets 0 (or n-index)
      const len = orderedItems.length;
      const updates = orderedItems.map((item, index) => ({
        id: item.id,
        sort_order: len - index,
      }));

      // Supabase update array
      // Unfortunately we must do individual updates or bulk rpc.
      for (const update of updates) {
        const { error } = await supabase
          .from(resourceType)
          .update({ sort_order: update.sort_order })
          .eq("id", update.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: `Successfully updated ${resourceType} order!` });
      queryClient.invalidateQueries({ queryKey: ["admin-course-items", courseId, resourceType] });
      queryClient.invalidateQueries({ queryKey: ["admin-classes"] });
      queryClient.invalidateQueries({ queryKey: ["admin-exams"] });
      setIsModified(false);
    },
    onError: (err) => {
      toast({ title: "Failed to save order", description: err.message, variant: "destructive" });
    },
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, newTitle }: { id: string; newTitle: string }) => {
      const { error } = await supabase.from(resourceType).update({ title: newTitle }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Renamed successfully!" });
      queryClient.invalidateQueries({ queryKey: ["admin-course-items", courseId, resourceType] });
      queryClient.invalidateQueries({ queryKey: ["admin-classes"] });
      queryClient.invalidateQueries({ queryKey: ["admin-exams"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to rename", description: err.message, variant: "destructive" });
    },
  });

  if (!courseId && courseName !== "Readymade Exams" && courseName !== "Archive Classes") return null;

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-4 duration-300">
      <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-4 mb-4 gap-4">
        <div>
          <CardTitle>Organize {resourceType === 'classes' ? 'Classes' : 'Exams'}</CardTitle>
          <CardDescription>
            {courseName} — Drag and drop to reorder items within this course. Shared items are included at the bottom by default.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onClose} className="shrink-0">
          <ChevronLeft className="h-4 w-4 mr-2" /> Back to Courses
        </Button>
      </CardHeader>
      
      <CardContent className="px-0 sm:px-6">
        {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">No {resourceType} found for this course.</div>
        ) : (
            <DraggableSortList
                items={items.map(i => ({ id: i.id, title: i.title, subtitle: `Priority: ${i.sort_order || 0}` }))}
                onSave={async (ordered) => {
                     const mapped = ordered.map(o => {
                         const found = items.find(i => i.id === o.id);
                         return found!;
                     });
                     await saveOrderMutation.mutateAsync(mapped);
                }}
                onCancel={onClose}
                title=""
                description=""
                onRename={(id, newTitle) => renameMutation.mutateAsync({ id, newTitle })}
                isRenaming={renameMutation.isPending}
            />
        )}
      </CardContent>
    </Card>
  );
}
