import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

interface CoursePositionManagerDialogProps {
  onClose: () => void;
}

interface CourseRow {
  id: string;
  name: string;
  priority: number;
  category: string[] | null;
  sub_category: string[] | null;
  sub_category_order: Record<string, number> | null;
}

function SortableCourseItem({
  id,
  name,
  index,
  total,
  onMoveUp,
  onMoveDown,
}: {
  id: string;
  name: string;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
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
        <h4 className="font-medium text-sm leading-snug break-words">{name}</h4>
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

// Lets admin pick a sub-category (course type — "Full Course", "GK-English",
// etc.) and drag-order just the courses that belong to it. Saved per-course
// into courses.sub_category_order (jsonb: { "<sub_category>": <int order> }),
// so the same course can sit at a different position under a different
// sub-category tab. Falls back to the global "priority" column when a
// sub_category has no override yet (see CourseSection.tsx on the landing page).
const CATEGORY_ORDER_KEY = "category_order_global";
const SUB_CATEGORY_ORDER_KEY = "sub_category_order_global";

// Drag/arrow reorder list for the TOP-LEVEL category filter buttons on the
// landing page (batch/HSC-year-level grouping) — shown under the dialog's
// "All" pill, separate from ordering courses inside one sub-category.
function CategoryOrderManager({ allCategories }: { allCategories: string[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<string[]>([]);
  const [isModified, setIsModified] = useState(false);

  const { data: savedOrder, isLoading } = useQuery({
    queryKey: ["category-order-manager"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", CATEGORY_ORDER_KEY).maybeSingle();
      return (data?.value as string[]) || [];
    },
  });

  useEffect(() => {
    if (savedOrder === undefined || allCategories.length === 0) return;
    const known = new Set(allCategories);
    const ordered = savedOrder.filter((s) => known.has(s));
    allCategories.forEach((s) => { if (!ordered.includes(s)) ordered.push(s); });
    setItems(ordered);
    setIsModified(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedOrder, allCategories.join("|")]);

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

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("app_settings").upsert({ key: CATEGORY_ORDER_KEY, value: items }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "ক্যাটাগরি বাটনের অর্ডার সেভ হয়েছে!" });
      setIsModified(false);
      queryClient.invalidateQueries({ queryKey: ["category-display-order"] });
      queryClient.invalidateQueries({ queryKey: ["category-order-manager"] });
    },
    onError: (err: any) => {
      toast({ title: "সেভ করা যায়নি", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="flex flex-col px-0 sm:px-6">
      <div className="flex items-center justify-between gap-2 px-2 sm:px-0 pb-3">
        <p className="text-xs text-muted-foreground">
          ল্যান্ডিং পেজে একদম উপরে কোন ক্যাটাগরি বাটন কোন দিকে (উপরে/নিচে অর্থাৎ বামে/ডানে) থাকবে, সেই ক্রম এখানে ঠিক করুন।
        </p>
        {isModified && (
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="shrink-0">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 bg-muted/10 sm:rounded-md sm:border p-0 sm:p-2">
        {isLoading ? (
          <div className="text-center p-8 text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : items.length === 0 ? (
          <div className="text-center p-8 text-muted-foreground">কোনো ক্যাটাগরি পাওয়া যায়নি।</div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items} strategy={verticalListSortingStrategy}>
              {items.map((cat, index) => (
                <SortableCourseItem
                  key={cat}
                  id={cat}
                  name={cat}
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
    </div>
  );
}

// Simple drag/arrow reorder list for the sub-category (course type) FILTER
// BUTTONS themselves shown on the landing page — separate from ordering the
// courses inside a sub-category. Saved once, globally, in app_settings.
function SubCategoryOrderManager({ allSubCategories }: { allSubCategories: string[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<string[]>([]);
  const [isModified, setIsModified] = useState(false);

  const { data: savedOrder, isLoading } = useQuery({
    queryKey: ["sub-category-order-manager"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", SUB_CATEGORY_ORDER_KEY).maybeSingle();
      return (data?.value as string[]) || [];
    },
  });

  useEffect(() => {
    if (savedOrder === undefined || allSubCategories.length === 0) return;
    const known = new Set(allSubCategories);
    const ordered = savedOrder.filter((s) => known.has(s));
    allSubCategories.forEach((s) => { if (!ordered.includes(s)) ordered.push(s); });
    setItems(ordered);
    setIsModified(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedOrder, allSubCategories.join("|")]);

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

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("app_settings").upsert({ key: SUB_CATEGORY_ORDER_KEY, value: items }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Sub-category বাটনের অর্ডার সেভ হয়েছে!" });
      setIsModified(false);
      queryClient.invalidateQueries({ queryKey: ["sub-category-display-order"] });
      queryClient.invalidateQueries({ queryKey: ["sub-category-order-manager"] });
    },
    onError: (err: any) => {
      toast({ title: "সেভ করা যায়নি", description: err.message, variant: "destructive" });
    },
  });

  if (allSubCategories.length < 2) return null;

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Sub-Category বাটনের অর্ডার</CardTitle>
            <CardDescription className="text-xs mt-1">
              ল্যান্ডিং পেজে কোর্স টাইপ (sub-category) বাটন গুলো কোন দিকে থাকবে, সেই ক্রম এখানে ঠিক করুন।
            </CardDescription>
          </div>
          {isModified && (
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="shrink-0">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              Save
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center p-4 text-muted-foreground text-sm flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items} strategy={verticalListSortingStrategy}>
              {items.map((sub, index) => (
                <SortableCourseItem
                  key={sub}
                  id={sub}
                  name={sub}
                  index={index}
                  total={items.length}
                  onMoveUp={() => moveItem(index, -1)}
                  onMoveDown={() => moveItem(index, 1)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
}

export function CoursePositionManagerDialog({ onClose }: CoursePositionManagerDialogProps) {
  const [selectedSub, setSelectedSub] = useState<string>("all");
  const [items, setItems] = useState<CourseRow[]>([]);
  const [isModified, setIsModified] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: allCourses, isLoading } = useQuery({
    queryKey: ["course-position-manager-all-courses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, name, priority, category, sub_category, sub_category_order")
        .eq("is_public", true);
      if (error) throw error;
      return (data || []) as unknown as CourseRow[];
    },
  });

  const allSubCategories = Array.from(
    new Set((allCourses || []).flatMap((c) => (Array.isArray(c.sub_category) ? c.sub_category : [])))
  ).sort();

  const allCategories = Array.from(
    new Set((allCourses || []).flatMap((c: any) => (Array.isArray(c.category) ? c.category : [])))
  ).sort();

  useEffect(() => {
    if (!allCourses || !selectedSub) return;
    if (selectedSub === "all") {
      const sorted = [...allCourses].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
      setItems(sorted);
      setIsModified(false);
      return;
    }
    const inSub = allCourses.filter((c) => Array.isArray(c.sub_category) && c.sub_category.includes(selectedSub));
    const sorted = [...inSub].sort((a, b) => {
      const orderA = a.sub_category_order?.[selectedSub] ?? a.priority ?? 0;
      const orderB = b.sub_category_order?.[selectedSub] ?? b.priority ?? 0;
      return orderA - orderB;
    });
    setItems(sorted);
    setIsModified(false);
  }, [allCourses, selectedSub]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIndex = prev.findIndex((c) => c.id === active.id);
        const newIndex = prev.findIndex((c) => c.id === over.id);
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
    mutationFn: async () => {
      if (selectedSub === "all") {
        // Global order — writes directly to the existing "priority" column,
        // which the landing page already uses as its default/fallback sort.
        const results = await Promise.allSettled(
          items.map((course, idx) => supabase.from("courses").update({ priority: idx }).eq("id", course.id))
        );
        const failures = results.filter(
          (r) => r.status === "rejected" || (r.status === "fulfilled" && (r.value as any).error)
        );
        if (failures.length > 0) {
          throw new Error(`${failures.length}/${items.length} কোর্সের পজিশন সেভ করা যায়নি, আবার চেষ্টা করুন।`);
        }
        return;
      }
      // Each course keeps its OWN full sub_category_order map — we only touch
      // the key for the currently-selected sub-category, so a course's order
      // under any other sub-category tab is left untouched.
      const results = await Promise.allSettled(
        items.map((course, idx) => {
          const nextMap = { ...(course.sub_category_order || {}), [selectedSub]: idx };
          return supabase.from("courses").update({ sub_category_order: nextMap }).eq("id", course.id);
        })
      );
      const failures = results.filter(
        (r) => r.status === "rejected" || (r.status === "fulfilled" && (r.value as any).error)
      );
      if (failures.length > 0) {
        throw new Error(`${failures.length}/${items.length} কোর্সের পজিশন সেভ করা যায়নি, আবার চেষ্টা করুন।`);
      }
    },
    onSuccess: () => {
      toast({ title: "কোর্সের পজিশন সেভ হয়েছে!" });
      setIsModified(false);
      queryClient.invalidateQueries({ queryKey: ["public-courses"] });
      queryClient.invalidateQueries({ queryKey: ["course-position-manager-all-courses"] });
    },
    onError: (err: any) => {
      toast({ title: "সেভ করা যায়নি", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-4 duration-300">
      <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-4 mb-4 gap-4">
        <div>
          <CardTitle>Manage Course Position</CardTitle>
          <CardDescription>
            "All" ট্যাবে গিয়ে একদম উপরের ক্যাটাগরি বাটন গুলোর ক্রম ঠিক করুন। অথবা একটা কোর্স টাইপ (sub-category) বেছে নিয়ে সেই টাইপের কোর্সগুলো ড্র্যাগ করে বা উপর-নিচ বাটন দিয়ে অর্ডার ঠিক করুন — এই অর্ডার শুধু ঐ টাইপের ট্যাবেই প্রযোজ্য, অন্য টাইপে এই কোর্সের অবস্থান আলাদা থাকতে পারে।
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onClose} className="shrink-0">
          <ChevronLeft className="h-4 w-4 mr-2" /> Back
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col px-0 sm:px-6">
        {isLoading ? (
          <div className="text-center p-8 text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 px-2 sm:px-0 pb-3">
              <Button
                type="button"
                size="sm"
                variant={selectedSub === "all" ? "default" : "outline"}
                onClick={() => setSelectedSub("all")}
              >
                All
              </Button>
              {allSubCategories.map((sub) => (
                <Button
                  key={sub}
                  type="button"
                  size="sm"
                  variant={selectedSub === sub ? "default" : "outline"}
                  onClick={() => setSelectedSub(sub)}
                >
                  {sub}
                </Button>
              ))}
            </div>

            {selectedSub === "all" && (
              <div className="mb-4">
                <CategoryOrderManager allCategories={allCategories} />
              </div>
            )}

            <div className="flex items-center justify-between gap-2 px-2 sm:px-0 pb-1">
              <p className="text-xs text-muted-foreground">
                {selectedSub === "all"
                  ? "সব কোর্সের overall (global) ক্রম — কোনো নির্দিষ্ট sub-category ছাড়া যেভাবে প্রথমে দেখা যাবে।"
                  : `"${selectedSub}" টাইপের কোর্স গুলোর ক্রম।`}
              </p>
              {isModified && (
                <Button size="sm" onClick={() => saveOrderMutation.mutate()} disabled={saveOrderMutation.isPending} className="shrink-0">
                  {saveOrderMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Position
                </Button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 bg-muted/10 sm:rounded-md sm:border p-0 sm:p-2">
              {items.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground">এই টাইপে কোনো কোর্স নেই।</div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={items.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                    {items.map((course, index) => (
                      <SortableCourseItem
                        key={course.id}
                        id={course.id}
                        name={course.name}
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
          </>
        )}
      </CardContent>

      <div className="px-2 sm:px-0">
        <SubCategoryOrderManager allSubCategories={allSubCategories} />
      </div>
    </Card>
  );
}
