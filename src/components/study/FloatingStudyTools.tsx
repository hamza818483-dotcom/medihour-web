import { useState } from "react";
import { useStudyTools, SOUNDS } from "@/contexts/StudyToolsContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Pause, X, Music, Volume2, Maximize2, Timer } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useNavigate } from "react-router-dom";

const FloatingStudyTools = () => {
  const { whiteNoise, pomodoro } = useStudyTools();
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();

  // Show if White Noise is Floating OR Pomodoro is Active (running in background)
  const showWhiteNoise = whiteNoise.isFloating || (whiteNoise.activeSound && whiteNoise.isPlaying);
  const showPomodoro = pomodoro.isActive;

  if (!showWhiteNoise && !showPomodoro) return null;

  const currentSound = SOUNDS.find(s => s.id === whiteNoise.activeSound);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed bottom-20 right-6 z-50 flex flex-col items-end gap-2">
      {/* Expanded Control Panel */}
      {isExpanded && (
        <Card className="w-64 shadow-2xl border-border bg-background/95 backdrop-blur animate-in slide-in-from-bottom-5">
          <CardContent className="p-4 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
                <h4 className="font-semibold text-sm">Active Tools</h4>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsExpanded(false)}>
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* White Noise Controls */}
            {whiteNoise.activeSound && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <Music className="h-4 w-4 text-primary" />
                            {currentSound?.name}
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => whiteNoise.toggleSound(whiteNoise.activeSound!)}>
                            {whiteNoise.isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                        </Button>
                    </div>
                    <div className="flex items-center gap-2">
                        <Volume2 className="h-3 w-3 text-muted-foreground" />
                        <Slider
                            value={[whiteNoise.volume]}
                            max={100}
                            onValueChange={(val) => whiteNoise.setVolume(val[0])}
                            className="flex-1"
                        />
                    </div>
                </div>
            )}

            {/* Pomodoro Status */}
            {pomodoro.isActive && (
                <div className="pt-2 border-t flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                        <Timer className="h-4 w-4 text-orange-500" />
                        <span className="font-mono font-bold">{formatTime(pomodoro.timeLeft)}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={pomodoro.toggleTimer}>
                        <Pause className="h-3 w-3" />
                    </Button>
                </div>
            )}

            <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => {
                    navigate("/dashboard/program");
                    whiteNoise.setIsFloating(false);
                    setIsExpanded(false);
                }}
            >
                <Maximize2 className="mr-2 h-3 w-3" /> Open Full Page
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Floating Trigger Circle */}
      <Button
        size="icon"
        className={`h-14 w-14 rounded-full shadow-xl transition-all duration-300 ${isExpanded ? 'scale-0 opacity-0' : 'scale-100 opacity-100'} ${pomodoro.isActive ? 'bg-orange-500 hover:bg-orange-600' : 'bg-primary hover:bg-primary/90'}`}
        onClick={() => setIsExpanded(true)}
      >
        {pomodoro.isActive ? (
            <div className="flex flex-col items-center leading-none">
                <span className="text-[10px] font-bold">{Math.ceil(pomodoro.timeLeft / 60)}m</span>
                <Timer className="h-4 w-4 mt-0.5" />
            </div>
        ) : (
            <Music className={`h-6 w-6 ${whiteNoise.isPlaying ? 'animate-pulse' : ''}`} />
        )}
      </Button>
    </div>
  );
};

export default FloatingStudyTools;
