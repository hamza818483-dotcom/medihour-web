/**
 * ClassSortableList - Wraps DraggableSortList for class reordering.
 * Saves sort_order to DB.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { DraggableSortList, SortableItem } from "./DraggableSortList";

interface ClassSortableListProps {
  classes: any[];
  onClose: () => void;
  sortColumn?: "sort_order" | "archive_sort_order" | "free_sort_order";
}

export function ClassSortableList({
  classes: initialClasses,
  onClose,
  sortColumn = "sort_order",
}: ClassSortableListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const items: SortableItem[] = initialClasses.map((cls) => ({
    id: cls.id,
    title: cls.title,
    subtitle: `${cls.course?.name || "No Course"} • ${cls.class_type || ""}`,
  }));

  const saveOrderMutation = useMutation({
    mutationFn: async (ordered: SortableItem[]) => {
      // Top = highest sort_order index
      for (let i = 0; i < ordered.length; i++) {
        const { error } = await supabase
          .from("classes")
          .update({ [sortColumn]: ordered.length - i })
          .eq("id", ordered[i].id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Order saved!" });
      queryClient.invalidateQueries({ queryKey: ["admin-classes"] });
      queryClient.invalidateQueries({ queryKey: ["course-classes"] });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save order", description: err.message, variant: "destructive" });
    },
  });

  return (
    <DraggableSortList
      items={items}
      onSave={(ordered) => saveOrderMutation.mutateAsync(ordered)}
      onCancel={onClose}
      title="Reorder Classes"
      description="Drag items to reorder. Top = higher priority. Click Save when done."
    />
  );
}
