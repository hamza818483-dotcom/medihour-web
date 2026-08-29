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

export const QUICK_ACCESS_ORDER_KEY = "quick_access_order_global";

interface QuickAccessSortDialogProps {
  titles: string[];
  onClose: () => void;
}

function SortableItem({
  title,
  index,
  total,
  onMoveUp,
  onMoveDown,
}: {
  title: string;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: title });

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
        "flex items-center gap-2 p-3 bg-card border rounded-lg mb-2",
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
        <h4 className="font-medium text-sm leading-snug break-words">{title}</h4>
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

// Position in this list == display order on the dashboard's Quick Access grid
// (fills left-to-right, top-to-bottom). Same drag/arrow pattern as SubjectSortDialog.
export function QuickAccessSortDialog({ titles, onClose }: QuickAccessSortDialogProps) {
  const [items, setItems] = useState<string[]>([]);
  const [isModified, setIsModified] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    setItems([...titles]);
    setIsModified(false);
  }, [titles]);

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
        .upsert({ key: QUICK_ACCESS_ORDER_KEY, value: orderedItems }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Quick Access order saved successfully!" });
      queryClient.invalidateQueries({ queryKey: ["quick-access-order"] });
      setIsModified(false);
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save order", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-4 duration-300">
      <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-4 mb-4 gap-4">
        <div>
          <CardTitle>Organize Quick Access</CardTitle>
          <CardDescription>
            Drag the grip handle, or tap the up/down arrows — position here becomes each card's position in the Quick Access grid students see.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onClose} className="shrink-0">
          <ChevronLeft className="h-4 w-4 mr-2" /> Back
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col">
        <div className="flex items-center justify-end py-2">
          <div className="flex gap-2">
            {isModified && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setItems([...titles])}>
                  Reset
                </Button>
                <Button
                  size="sm"
                  onClick={() => saveOrderMutation.mutate(items)}
                  disabled={saveOrderMutation.isPending}
                >
                  {saveOrderMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Position
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 min-h-0 bg-muted/10 rounded-md border p-2">
          {items.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">No cards available.</div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={items} strategy={verticalListSortingStrategy}>
                {items.map((title, index) => (
                  <SortableItem
                    key={title}
                    title={title}
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
