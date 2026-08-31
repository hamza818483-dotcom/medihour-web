import { Timer } from "lucide-react";

const FocusTimer = () => {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Timer className="h-8 w-8" />
      </div>
      <h1 className="text-xl font-bold tracking-tight">Focus Timer</h1>
      <p className="text-sm text-muted-foreground">শীঘ্রই আসছে...</p>
    </div>
  );
};

export default FocusTimer;
