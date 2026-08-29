/**
 * DraggableSortList - A scroll-safe drag-and-drop list using @atlaskit/pragmatic-drag-and-drop
 * Supports per-course and per-chapter sorting for classes and exams.
 */
import { useEffect, useRef, useState } from "react";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";

import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { reorderWithEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/util/reorder-with-edge";
import { GripVertical, Save, X, Loader2, ChevronUp, ChevronDown, Pencil, Check, X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface SortableItem {
  id: string;
  title: string;
  subtitle?: string;
}

interface DraggableSortListProps {
  items: SortableItem[];
  onSave: (orderedItems: SortableItem[]) => Promise<void>;
  onCancel: () => void;
  title?: string;
  description?: string;
  onRename?: (id: string, newTitle: string) => Promise<void> | void;
  isRenaming?: boolean;
}

type DragState = "idle" | "dragging-over";

function DraggableRow({
  item,
  index,
  total,
  onDragStart,
  onMoveUp,
  onMoveDown,
  onRename,
  isRenaming,
}: {
  item: SortableItem;
  index: number;
  total: number;
  onDragStart: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRename?: (id: string, newTitle: string) => Promise<void> | void;
  isRenaming?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<DragState>("idle");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);

  const startEdit = () => {
    setDraft(item.title);
    setEditing(true);
  };

  const commitEdit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === item.title) {
      setEditing(false);
      return;
    }
    await onRename?.(item.id, trimmed);
    setEditing(false);
  };

  useEffect(() => {
    const el = ref.current;
    const handle = dragHandleRef.current;
    if (!el || !handle) return;

    return combine(
      draggable({
        element: el,
        dragHandle: handle,
        getInitialData: () => ({ id: item.id, index }),
        onDragStart: () => {
          setState("dragging-over");
          onDragStart();
        },
        onDrop: () => setState("idle"),
      }),
      dropTargetForElements({
        element: el,
        getData: ({ input, element }) => {
          const closestEdge = extractClosestEdge(input, element as HTMLElement, ["top", "bottom"]);
          return { id: item.id, index, closestEdge };
        },
        onDragEnter: () => setState("dragging-over"),
        onDragLeave: () => setState("idle"),
        onDrop: () => setState("idle"),
      })
    );
  }, [item.id, index, onDragStart]);

  return (
    <div
      ref={ref}
      className={`flex items-center gap-2 p-3 border-y sm:border rounded-none sm:rounded-md bg-card mb-2 w-full transition-all duration-150 ${
        state === "dragging-over"
          ? "border-primary/60 bg-primary/5 shadow-md"
          : "border-border/60"
      }`}
    >
      <div
        ref={dragHandleRef}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none shrink-0"
      >
        <GripVertical className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        {editing ? (
          <div className="flex flex-col gap-1.5">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              ref={(el) => { if (el) setTimeout(() => el.focus({ preventScroll: true }), 0); }}
              className="text-sm py-1.5 min-h-0 resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commitEdit(); }
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <div className="flex gap-1.5">
              <button type="button" onClick={commitEdit} disabled={isRenaming} className="h-6 px-2 rounded flex items-center gap-1 text-[11px] font-medium bg-primary text-primary-foreground disabled:opacity-50">
                {isRenaming ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
              </button>
              <button type="button" onClick={() => setEditing(false)} className="h-6 px-2 rounded flex items-center gap-1 text-[11px] font-medium border bg-background">
                <XIcon className="h-3 w-3" /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="font-medium break-words whitespace-normal">{item.title}</p>
            {item.subtitle && (
              <p className="text-xs text-muted-foreground break-words whitespace-normal">{item.subtitle}</p>
            )}
          </>
        )}
      </div>
      {!editing && onRename && (
        <button
          type="button"
          onClick={startEdit}
          className="h-6 w-6 rounded flex items-center justify-center border bg-background hover:bg-muted flex-shrink-0"
          aria-label="Edit title"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="text-xs text-muted-foreground shrink-0 font-mono bg-muted/40 px-1.5 py-0.5 rounded">
        #{index + 1}
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

export function DraggableSortList({
  items: initialItems,
  onSave,
  onCancel,
  title = "Reorder Items",
  description = "Drag and drop to change order.",
  onRename,
  isRenaming,
}: DraggableSortListProps) {
  const [items, setItems] = useState<SortableItem[]>(initialItems);
  const [saving, setSaving] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);



  // Listen to drop events on the list container
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;

    return dropTargetForElements({
      element: container,
      onDrop: ({ source, location }) => {
        if (!location.current.dropTargets.length) return;

        const draggedId = source.data.id as string;
        const target = location.current.dropTargets[0]?.data;

        if (!target || draggedId === target.id) return;

        const fromIndex = items.findIndex((i) => i.id === draggedId);
        const toIndex = items.findIndex((i) => i.id === target.id);

        if (fromIndex === -1 || toIndex === -1) return;

        const edge = (target.closestEdge as "top" | "bottom") ?? "bottom";

        setItems((prev) =>
          reorderWithEdge({
            list: prev,
            startIndex: fromIndex,
            indexOfTarget: toIndex,
            closestEdgeOfTarget: edge,
            axis: "vertical",
          })
        );
      },
    });
  }, [items]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(items);
    } finally {
      setSaving(false);
    }
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    setItems((prev) => {
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(newIndex, 0, moved);
      return next;
    });
  };

  const handleRenameLocal = async (id: string, newTitle: string) => {
    await onRename?.(id, newTitle);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, title: newTitle } : i)));
  };

  return (
    <div className="space-y-4 border-0 sm:border rounded-none sm:rounded-lg p-0 sm:p-4 bg-transparent sm:bg-muted/20 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-2 sm:px-0">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold truncate">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
            <X className="h-4 w-4 mr-2" /> Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {saving ? "Saving..." : "Save Order"}
          </Button>
        </div>
      </div>

      <div ref={listRef} className="max-h-[65vh] overflow-y-auto -mx-2 sm:mx-0 px-0 space-y-0">
        {items.map((item, index) => (
          <DraggableRow
            key={item.id}
            item={item}
            index={index}
            total={items.length}
            onDragStart={() => {}}
            onMoveUp={() => moveItem(index, -1)}
            onMoveDown={() => moveItem(index, 1)}
            onRename={onRename ? handleRenameLocal : undefined}
            isRenaming={isRenaming}
          />
        ))}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No items to sort.</p>
        )}
      </div>
    </div>
  );
}
