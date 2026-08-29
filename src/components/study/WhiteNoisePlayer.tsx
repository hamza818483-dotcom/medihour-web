import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Pause, CloudRain, Trees, Coffee, Waves, Volume2, VolumeX, Minimize2 } from "lucide-react";
import { useStudyTools, SOUNDS } from "@/contexts/StudyToolsContext";

// Map IDs to Icons (since context only holds data)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICONS: Record<string, any> = {
    rain: CloudRain,
    forest: Trees,
    cafe: Coffee,
    white: Waves
};

const WhiteNoisePlayer = () => {
  const { whiteNoise } = useStudyTools();
  const { activeSound, isPlaying, volume, toggleSound, setVolume, setIsFloating } = whiteNoise;

  return (
    <div className="flex flex-col gap-4 w-full">
        <div className="flex justify-end">
             {activeSound && (
                 <Button variant="ghost" size="sm" onClick={() => setIsFloating(true)} className="text-xs">
                     <Minimize2 className="mr-2 h-4 w-4" /> Float Player
                 </Button>
             )}
        </div>

        {/* Sound Selection Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {SOUNDS.map((sound) => {
                const isActive = activeSound === sound.id;
                const Icon = ICONS[sound.id] || Waves;

                return (
                    <Button
                        key={sound.id}
                        variant={isActive ? "default" : "outline"}
                        className={`h-24 flex flex-col items-center justify-center gap-2 transition-all ${isActive && isPlaying ? "animate-pulse border-primary" : ""}`}
                        onClick={() => toggleSound(sound.id)}
                    >
                        <Icon className={`h-8 w-8 ${isActive ? "text-primary-foreground" : "text-muted-foreground"}`} />
                        <span className="text-xs font-semibold">{sound.name}</span>
                        {isActive && (
                            <div className="absolute top-2 right-2">
                                {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                            </div>
                        )}
                    </Button>
                );
            })}
        </div>

        {/* Volume Control */}
        {activeSound && (
            <Card className="animate-in fade-in slide-in-from-top-2 border-border/50 bg-muted/30">
                <CardContent className="p-4 flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setVolume(volume === 0 ? 50 : 0)}
                        className="h-8 w-8"
                    >
                        {volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </Button>
                    <Slider
                        value={[volume]}
                        max={100}
                        step={1}
                        onValueChange={(val) => setVolume(val[0])}
                        className="flex-1"
                    />
                    <span className="text-xs font-mono w-8 text-right">{volume}%</span>
                </CardContent>
            </Card>
        )}
    </div>
  );
};

export default WhiteNoisePlayer;
