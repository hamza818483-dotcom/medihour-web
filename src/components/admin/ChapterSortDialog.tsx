import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, GripVertical, Save, Loader2, ChevronUp, ChevronDown } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
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
import { cn } from "@/lib/utils";

interface ChapterSortDialogProps {
  courseId: string | null;
  subject: string;
  chapters: string[];
  contextName: string;
  onClose: () => void;
  /** Settings key to persist order under. Defaults to chapter_order_global_{subject} for backward compat. */
  settingsKey?: string;
  /** Title override, e.g. "Organize Boards - Physics / Chapter 1" */
  title?: string;
  /** Extra query keys to invalidate on save, beyond the chapter defaults. */
  extraInvalidateKeys?: string[];
}

function SortableChapterItem({
  chapter,
  index,
  total,
  onMoveUp,
  onMoveDown,
}: {
  chapter: string;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: chapter });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 p-3 bg-card border-y sm:border rounded-none sm:rounded-lg mb-2",
        isDragging ? "shadow-lg border-primary/50" : "hover:border-primary/30"
      )}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-2 -m-1 bg-muted/50 rounded flex-shrink-0 touch-none">
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </div>
      <span className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-sm leading-snug break-words">{chapter}</h4>
      </div>
      <div className="flex flex-col gap-0.5 flex-shrink-0">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={index === 0}
          className="h-6 w-6 rounded flex items-center justify-center border bg-background disabled:opacity-30 disabled:cursor-not-allowed hover:bg-muted"
          aria-label="Move up"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={index === total - 1}
          className="h-6 w-6 rounded flex items-center justify-center border bg-background disabled:opacity-30 disabled:cursor-not-allowed hover:bg-muted"
          aria-label="Move down"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function ChapterSortDialog({ subject, chapters, contextName, onClose, settingsKey: settingsKeyProp, title, extraInvalidateKeys }: ChapterSortDialogProps) {
  const [items, setItems] = useState<string[]>([]);
  const [isModified, setIsModified] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const settingsKey = settingsKeyProp || `chapter_order_global_${subject}`;

  useEffect(() => {
    setItems([...chapters]);
    setIsModified(false);
  }, [chapters]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIndex = prev.indexOf(active.id as string);
        const newIndex = prev.indexOf(over.id as string);
        setIsModified(true);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    setItems((prev) => {
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      setIsModified(true);
      return arrayMove(prev, index, newIndex);
    });
  };

  const saveOrderMutation = useMutation({
    mutationFn: async (orderedItems: string[]) => {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: settingsKey, value: orderedItems }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: `${contextName} order saved successfully!` });
      queryClient.invalidateQueries({ queryKey: ["course-chapters"] });
      queryClient.invalidateQueries({ queryKey: ["archive-classes-chapters"] });
      queryClient.invalidateQueries({ queryKey: ["archive-exams-chapters"] });
      queryClient.invalidateQueries({ queryKey: ["readymade-exams-chapters"] });
      (extraInvalidateKeys || []).forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      setIsModified(false);
      onClose();
    },
    onError: (err) => {
      toast({ title: "Failed to save order", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-4 duration-300">
      <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-4 mb-4 gap-4">
        <div>
          <CardTitle>{title || `Organize Chapters - ${subject}`}</CardTitle>
          <CardDescription>
            Drag the grip handle, or tap the up/down arrows, to reorder for {contextName}.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onClose} className="shrink-0">
          <ChevronLeft className="h-4 w-4 mr-2" /> Back
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col px-0 sm:px-6">
        <div className="flex items-center justify-end py-2 px-2 sm:px-0">
            <div className="flex gap-2">
                {isModified && (
                    <>
                    <Button variant="ghost" size="sm" onClick={() => setItems([...chapters])}>
                        Reset
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => saveOrderMutation.mutate(items)}
                        disabled={saveOrderMutation.isPending}
                    >
                        {saveOrderMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                        Save Sequence
                    </Button>
                    </>
                )}
            </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 bg-muted/10 sm:rounded-md sm:border p-0 sm:p-2">
            {items.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground">No chapters available.</div>
            ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={items} strategy={verticalListSortingStrategy}>
                        {items.map((chapter, index) => (
                            <SortableChapterItem
                              key={chapter}
                              chapter={chapter}
                              index={index}
                              total={items.length}
                              onMoveUp={() => moveItem(index, -1)}
                              onMoveDown={() => moveItem(index, 1)}
                            />
                        ))}
                    </SortableContext>
                </DndContext>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
