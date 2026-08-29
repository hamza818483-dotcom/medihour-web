import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Plus, GripVertical, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudyTools } from "@/contexts/StudyToolsContext";

interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
}

const TodoList = () => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [input, setInput] = useState("");
  const { updateStats } = useStudyTools();

  // Load from local storage
  useEffect(() => {
    const saved = localStorage.getItem("study_todos");
    if (saved) {
      try {
        setTodos(JSON.parse(saved));
      } catch {
        localStorage.removeItem("study_todos");
      }
    }
  }, []);

  // Save to local storage
  useEffect(() => {
    localStorage.setItem("study_todos", JSON.stringify(todos));
  }, [todos]);

  const addTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const newTodo: Todo = {
      id: crypto.randomUUID(),
      text: input.trim(),
      completed: false,
      createdAt: Date.now(),
    };

    setTodos([newTodo, ...todos]);
    setInput("");
  };

  const toggleTodo = (id: string) => {
    const todo = todos.find(t => t.id === id);
    if (todo && !todo.completed) {
        updateStats("todos_completed", 1);
    }
    setTodos(
      todos.map((t) =>
        t.id === id ? { ...t, completed: !t.completed } : t
      )
    );
  };

  const deleteTodo = (id: string) => {
    setTodos(todos.filter((t) => t.id !== id));
  };

  const activeTodos = todos.filter(t => !t.completed);
  const completedTodos = todos.filter(t => t.completed);

  return (
    <div className="w-full max-w-xl mx-auto space-y-6">
      <form onSubmit={addTodo} className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add a new task..."
          className="flex-1"
        />
        <Button type="submit">
          <Plus className="mr-2 h-4 w-4" /> Add
        </Button>
      </form>

      <div className="space-y-1">
        {activeTodos.map((todo) => (
          <div
            key={todo.id}
            className="flex items-center gap-3 p-3 bg-card rounded-lg border hover:border-primary/50 transition-colors group animate-in slide-in-from-left-2"
          >
            <button onClick={() => toggleTodo(todo.id)} className="text-muted-foreground hover:text-primary transition-colors">
                <Circle className="h-5 w-5" />
            </button>
            <span className="flex-1">{todo.text}</span>
            <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteTodo(todo.id)}
                className="opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10 h-8 w-8"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        {activeTodos.length === 0 && completedTodos.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
                No tasks yet. Stay organized!
            </div>
        )}
      </div>

      {completedTodos.length > 0 && (
        <div className="space-y-2 pt-4 border-t border-dashed">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Completed</h4>
            <div className="space-y-1 opacity-60 hover:opacity-100 transition-opacity">
                {completedTodos.map((todo) => (
                <div
                    key={todo.id}
                    className="flex items-center gap-3 p-2 rounded-lg group"
                >
                    <button onClick={() => toggleTodo(todo.id)} className="text-green-500">
                        <CheckCircle2 className="h-5 w-5" />
                    </button>
                    <span className="flex-1 line-through text-muted-foreground decoration-2">{todo.text}</span>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteTodo(todo.id)}
                        className="opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10 h-8 w-8"
                    >
                    <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
                ))}
            </div>
        </div>
      )}
    </div>
  );
};

export default TodoList;
