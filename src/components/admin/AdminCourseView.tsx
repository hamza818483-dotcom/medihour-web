import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { GripVertical, Save, X, BookOpen, Layers } from "lucide-react";
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
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "react-router-dom";
import { CourseItemsManagerDialog } from "./CourseItemsManagerDialog";

interface CourseWithCounts {
  id: string;
  name: string;
  priority: number;
  itemCount: number;
}

function SortableCourseCard({ course, resourceType, onSelectCourse }: { course: CourseWithCounts, resourceType: "classes" | "exams", onSelectCourse: (id: string, name: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: course.id });
  const navigate = useNavigate();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <Card 
      ref={setNodeRef} 
      style={style} 
      onClick={() => { if (!isDragging) onSelectCourse(course.id, course.name) }}
      className={`cursor-pointer ${isDragging ? 'shadow-lg border-primary/50' : 'hover:border-primary/50'} flex flex-col h-full active:scale-[0.99] transition-transform`}
    >
      <CardContent className="p-5 flex flex-col h-full gap-4">
        <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 max-w-full min-w-0">
                <div {...attributes} {...listeners} onClick={(e) => e.stopPropagation()} className="cursor-grab text-muted-foreground hover:text-foreground shrink-0 active:cursor-grabbing p-1 bg-muted/50 rounded-md">
                    <GripVertical className="h-4 w-4" />
                </div>
                <h3 className="font-semibold text-base leading-tight truncate px-1" title={course.name}>
                    {course.name}
                </h3>
            </div>
        </div>
        
        <div className="mt-auto pt-4 border-t flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
                {resourceType === "classes" ? <BookOpen className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
                <span className="font-medium text-foreground">{course.itemCount}</span> {resourceType === "classes" ? "Classes" : "Exams"}
            </div>
            <div className="text-xs px-2 py-0.5 bg-secondary rounded-full">
                Priority: {course.priority || 0}
            </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface AdminCourseViewProps {
  resourceType: "classes" | "exams";
}

export function AdminCourseView({ resourceType }: AdminCourseViewProps) {
  const [items, setItems] = useState<CourseWithCounts[]>([]);
  const [isModified, setIsModified] = useState(false);
  const [selectedCourseDialogId, setSelectedCourseDialogId] = useState<string | null>(null);
  const [selectedCourseDialogName, setSelectedCourseDialogName] = useState("");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: courses, isLoading } = useQuery({
    queryKey: ["admin-course-view", resourceType],
    queryFn: async () => {
      // First fetch courses with priority
      const { data: coursesData, error } = await supabase
        .from("courses")
        .select("id, name, priority")
        .order("priority", { ascending: false });

      if (error) throw error;

      // Now fetch counts from the respective table grouped by course
      const { data: countsData, error: countsError } = await supabase
        .from(resourceType)
        .select("course_id");

      if (countsError) throw countsError;

      const countsMap = countsData.reduce((acc: any, curr: any) => {
        if (curr.course_id) {
            acc[curr.course_id] = (acc[curr.course_id] || 0) + 1;
        }
        return acc;
      }, {});

      return coursesData.map(c => ({
          ...c,
          itemCount: countsMap[c.id] || 0
      })) as CourseWithCounts[];
    },
  });

  useEffect(() => {
    if (courses) {
        setItems(courses);
        setIsModified(false);
    }
  }, [courses]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        setIsModified(true);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const saveOrderMutation = useMutation({
    mutationFn: async (orderedItems: CourseWithCounts[]) => {
      // Top item gets highest index, bottom item gets lowest index
      const updates = orderedItems.map((item, index) => ({
        id: item.id,
        priority: orderedItems.length - index,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from("courses")
          .update({ priority: update.priority })
          .eq("id", update.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Course priorities updated successfully!" });
      queryClient.invalidateQueries({ queryKey: ["admin-course-view"] });
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      queryClient.invalidateQueries({ queryKey: ["public-courses"] });
      setIsModified(false);
    },
    onError: (err) => {
      toast({ title: "Failed to save order", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
      return <div className="text-sm text-muted-foreground p-8 text-center bg-muted/20 rounded-md border border-dashed">Loading courses...</div>;
  }

  if (!items || items.length === 0) {
      return <div className="text-sm text-muted-foreground p-8 text-center bg-muted/20 rounded-md border border-dashed">No courses available.</div>;
  }

  if (selectedCourseDialogId) {
      return (
          <CourseItemsManagerDialog 
            courseId={selectedCourseDialogId} 
            courseName={selectedCourseDialogName} 
            resourceType={resourceType} 
            onClose={() => setSelectedCourseDialogId(null)} 
          />
      );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-muted/30 p-3 rounded-lg border">
          <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Course View</span> — Drag & drop courses to reorder their priority on the public site.
          </div>
          {isModified && (
              <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setItems(courses || [])}>
                      <X className="h-4 w-4 mr-2" /> Cancel
                  </Button>
                  <Button size="sm" onClick={() => saveOrderMutation.mutate(items)} disabled={saveOrderMutation.isPending}>
                      <Save className="h-4 w-4 mr-2" /> {saveOrderMutation.isPending ? "Saving..." : "Save Priorities"}
                  </Button>
              </div>
          )}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {items.map((item) => (
              <SortableCourseCard 
                key={item.id} 
                course={item} 
                resourceType={resourceType} 
                onSelectCourse={(id, name) => {
                    setSelectedCourseDialogId(id);
                    setSelectedCourseDialogName(name);
                }}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
