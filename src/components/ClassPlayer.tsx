import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Settings,
  Maximize,
  Minimize,
  MonitorPlay
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStudyTools } from "@/contexts/StudyToolsContext";
import { useToast } from "@/hooks/use-toast";
import { extractVideoId } from "@/lib/videoUtils";

interface ClassPlayerProps {
  videoId: string;
  title?: string;
  onEnded?: () => void;
  isLive?: boolean;
  startTime?: string | null;
  classId?: string;
  watchCategory?: "live" | "record" | "archive";
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}



const ClassPlayer = ({ videoId, title, onEnded, isLive, startTime, classId, watchCategory }: ClassPlayerProps) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [watchTime, setWatchTime] = useState(0);
  const { updateStreak, updateStats } = useStudyTools();
  const { toast } = useToast();
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [forceRotate, setForceRotate] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [lastTapTime, setLastTapTime] = useState(0);
  const [availableQualities, setAvailableQualities] = useState<string[]>([]);
  const [currentQuality, setCurrentQuality] = useState<string>("auto");
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();



  const actualVideoId = extractVideoId(videoId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onPlayerReady = (event: any) => {
    setDuration(event.target.getDuration());
    setVolume(event.target.getVolume());
    updateQualityLevels();

    // Force best available quality (YouTube lists qualities highest-first)
    if (typeof event.target.getAvailableQualityLevels === 'function' && typeof event.target.setPlaybackQuality === 'function') {
      const levels = event.target.getAvailableQualityLevels();
      if (levels && levels.length > 0) {
        event.target.setPlaybackQuality(levels[0]);
        setCurrentQuality(levels[0]);
      }
    }

    if (isLive && startTime) {
        const start = new Date(startTime).getTime();
        const now = Date.now();
        const elapsedSeconds = (now - start) / 1000;
        if (elapsedSeconds > 0) {
            // Check if seekTo is available
            if (event.target.seekTo) {
                 event.target.seekTo(elapsedSeconds, true);
            }
        }
    }

    // Start interval to update time
    setInterval(() => {
      if (playerRef.current && playerRef.current.getCurrentTime) {
        setCurrentTime(playerRef.current.getCurrentTime());
      }
    }, 1000);
  };

  // Sync Live Time
  useEffect(() => {
      if (!isLive || !startTime || !playerRef.current || !isPlaying) return;

      const interval = setInterval(() => {
          const start = new Date(startTime).getTime();
          const now = Date.now();
          const elapsedSeconds = (now - start) / 1000;
          if (elapsedSeconds > 0 && Math.abs(currentTime - elapsedSeconds) > 10) {
              if (playerRef.current.seekTo) {
                  playerRef.current.seekTo(elapsedSeconds, true);
              }
          }
      }, 10000); // Check every 10s

      return () => clearInterval(interval);
  }, [isLive, startTime, isPlaying, currentTime]);


  // Track watch time for streak & stats
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isPlaying) {
      interval = setInterval(() => {
        setWatchTime((prev) => {
          const newState = prev + 1;

          // Update streak at 30 mins
          if (newState === 1800) {
             updateStreak();
             toast({ title: "Study Streak Updated!", description: "You've studied for 30 minutes." });
          }

          // Update stats every minute (to avoid spamming DB every second)
          if (newState % 60 === 0) {
              updateStats("total_class_time", 1); // Add 1 minute
          }

          return newState;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, updateStreak, toast, updateStats]);

  // Sync watch time to the backend for the Class Report feature (My Progress
  // & History). Accumulates seconds locally, flushes every 30s and on
  // unmount/pause, so we don't spam the DB every second.
  const unsyncedSecondsRef = useRef(0);
  const lastSyncedWatchTimeRef = useRef(0);

  useEffect(() => {
    if (!classId || !watchCategory) return;

    const flush = () => {
      const pending = unsyncedSecondsRef.current;
      if (pending <= 0) return;
      unsyncedSecondsRef.current = 0;
      supabase.rpc("log_class_watch_time" as any, {
        p_class_id: classId,
        p_category: watchCategory,
        p_seconds: pending,
      }).then(({ error }) => {
        if (error) {
          // Re-queue on failure so we don't silently lose watch time
          unsyncedSecondsRef.current += pending;
        }
      });
    };

    const syncInterval = setInterval(flush, 30000);
    return () => {
      clearInterval(syncInterval);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, watchCategory]);

  useEffect(() => {
    if (!classId || !watchCategory) return;
    const delta = watchTime - lastSyncedWatchTimeRef.current;
    if (delta > 0) {
      unsyncedSecondsRef.current += delta;
      lastSyncedWatchTimeRef.current = watchTime;
    }
  }, [watchTime, classId, watchCategory]);

  const updateQualityLevels = () => {
    if (playerRef.current && playerRef.current.getAvailableQualityLevels) {
        setAvailableQualities(playerRef.current.getAvailableQualityLevels());
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onPlayerStateChange = (event: any) => {
    setIsPlaying(event.data === window.YT.PlayerState.PLAYING);
    if (event.data === window.YT.PlayerState.ENDED && onEnded) {
      onEnded();
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onQualityChange = (event: any) => {
      setCurrentQuality(event.data);
  };

  const initializePlayer = useCallback(() => {
    if (playerRef.current) return; // Already initialized

    playerRef.current = new window.YT.Player("youtube-player", {
      height: "100%",
      width: "100%",
      videoId: actualVideoId,
      playerVars: {
        playsinline: 1,
        controls: 0, // Hide default controls
        modestbranding: 1,
        rel: 0,
        showinfo: 0,
        fs: 0, // Hide fullscreen button
        iv_load_policy: 3, // Hide annotations
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange,
        onPlaybackQualityChange: onQualityChange,
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualVideoId]);

  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = initializePlayer;
    } else {
      initializePlayer();
    }

    return () => {
        if (playerRef.current) {
            try {
                playerRef.current.destroy();
            } catch (e) {
                console.error("Error destroying player", e);
            }
        }
    };
  }, [actualVideoId, initializePlayer]);

  const handlePlayPause = () => {
    if (!playerRef.current || typeof playerRef.current.playVideo !== 'function') return;
    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  };

  const handleSeek = (value: number[]) => {
    if (!playerRef.current || typeof playerRef.current.seekTo !== 'function') return;
    const newTime = value[0];
    setCurrentTime(newTime);
    playerRef.current.seekTo(newTime, true);
  };

  const handleVolumeChange = (value: number[]) => {
    if (!playerRef.current || typeof playerRef.current.setVolume !== 'function') return;
    const newVolume = value[0];
    setVolume(newVolume);
    playerRef.current.setVolume(newVolume);
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
      playerRef.current.unMute();
    }
  };

  const toggleMute = () => {
    if (!playerRef.current || typeof playerRef.current.mute !== 'function') return;
    if (isMuted) {
      playerRef.current.unMute();
      playerRef.current.setVolume(volume || 100);
      setIsMuted(false);
    } else {
      playerRef.current.mute();
      setIsMuted(true);
    }
  };

  const handlePlaybackRate = (rate: number) => {
    if (!playerRef.current || typeof playerRef.current.setPlaybackRate !== 'function') return;
    setPlaybackRate(rate);
    playerRef.current.setPlaybackRate(rate);
  };

  const handleQualityChange = (quality: string) => {
      if (playerRef.current && typeof playerRef.current.setPlaybackQuality === 'function') {
          playerRef.current.setPlaybackQuality(quality);
          setCurrentQuality(quality);
      }
  };

  const skipForward = () => {
    if (!playerRef.current || typeof playerRef.current.getCurrentTime !== 'function') return;
    const current = playerRef.current.getCurrentTime();
    const newTime = Math.min(current + 10, duration);
    playerRef.current.seekTo(newTime, true);
    setCurrentTime(newTime);
  };

  const skipBackward = () => {
    if (!playerRef.current || typeof playerRef.current.getCurrentTime !== 'function') return;
    const current = playerRef.current.getCurrentTime();
    const newTime = Math.max(current - 10, 0);
    playerRef.current.seekTo(newTime, true);
    setCurrentTime(newTime);
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        if (containerRef.current.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        } else if ((containerRef.current as any).webkitRequestFullscreen) {
          await (containerRef.current as any).webkitRequestFullscreen();
        }

        // Attempt native orientation lock on mobile (works in some browsers).
        // If it's unsupported or rejected (common on Chrome Android outside
        // a PWA), fall back to a CSS rotation so landscape fullscreen still
        // works everywhere.
        if (window.innerWidth < 768) {
          let lockedNatively = false;
          if (screen.orientation && (screen.orientation as any).lock) {
            try {
              await (screen.orientation as any).lock('landscape');
              lockedNatively = true;
            } catch {
              lockedNatively = false;
            }
          }
          if (!lockedNatively) {
            setForceRotate(true);
          }
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.error("Fullscreen error:", err);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const now = Date.now();
    const gap = now - lastTapTime;
    
    if (gap < 300) {
      const touch = e.touches[0];
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const x = touch.clientX - rect.left;
        if (x < rect.width / 3) {
          skipBackward();
          toast({ title: "Rewind 10s", duration: 1000 });
        } else if (x > (rect.width * 2) / 3) {
          skipForward();
          toast({ title: "Forward 10s", duration: 1000 });
        }
      }
    }
    setLastTapTime(now);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
        controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      if (!document.fullscreenElement) {
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock().catch(() => {});
        }
        setForceRotate(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
      // Hide controls initially after 3s if playing
      if (isPlaying) {
          controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
      } else {
          setShowControls(true);
          if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      }
      return () => {
          if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      }
  }, [isPlaying]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      switch(e.code) {
        case 'Space':
        case 'KeyK':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skipBackward();
          break;
        case 'ArrowRight':
          e.preventDefault();
          skipForward();
          break;
        case 'KeyF':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'KeyM':
          e.preventDefault();
          toggleMute();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, currentTime, isMuted, volume]);




  return (
    <TooltipProvider>
      <div
          ref={containerRef}
          className={`relative group bg-black w-full aspect-video overflow-hidden rounded-lg shadow-xl select-none ${forceRotate ? 'force-rotate-landscape' : ''}`}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => isPlaying && setShowControls(false)}
          onDoubleClick={toggleFullscreen}
          onTouchStart={handleTouchStart}
      >


        <div id="youtube-player" className="w-full h-full pointer-events-none" />

        {/* Full-area tap-to-toggle play/pause — placed above the video so it
            works reliably even in rotated (forceRotate) fullscreen mode where
            some browsers mis-map touch coordinates on nested/transformed
            elements. Sits below the controls overlay (z-10 vs z-20) so it
            doesn't block button/slider interactions. */}
        <div
          className="absolute inset-0 z-10 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); handlePlayPause(); }}
        />

        {/* Overlay/Controls */}
        <div
          className={`absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent transition-opacity duration-300 flex flex-col justify-end px-3 sm:px-4 pb-2 z-20 ${showControls ? 'opacity-100' : 'opacity-0 cursor-none pointer-events-none'}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Progress Bar */}
          {!isLive ? (
            <div className="mb-2 group/slider w-full">
                <Slider
                    value={[currentTime]}
                    min={0}
                    max={duration || 100}
                    step={1}
                    onValueChange={handleSeek}
                    className="cursor-pointer py-2 [&>.relative>.bg-primary]:h-1 [&>.relative>.bg-primary]:sm:h-1.5 [&>.relative>.bg-primary]:group-hover/slider:h-2 [&>.relative]:h-1 [&>.relative]:sm:h-1.5 [&>.relative]:group-hover/slider:h-2 transition-all [&_span[role='slider']]:h-3 [&_span[role='slider']]:w-3 [&_span[role='slider']]:sm:h-5 [&_span[role='slider']]:sm:w-5"
                />
            </div>
          ) : (
              <div className="mb-2 w-full flex items-center gap-2">
                  <div className="h-1.5 flex-1 bg-red-600 rounded-full animate-pulse opacity-50" />
                  <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider animate-pulse flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full inline-block" /> Live
                  </span>
              </div>
          )}

          <div className="flex items-center justify-between pb-1 sm:pb-2 pointer-events-auto">
            <div className="flex items-center gap-2 sm:gap-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={handlePlayPause} className="text-white hover:bg-white/20 hover:text-white h-8 w-8 sm:h-10 sm:w-10">
                    {isPlaying ? <Pause className="h-5 w-5 sm:h-6 sm:w-6 fill-current" /> : <Play className="h-5 w-5 sm:h-6 sm:w-6 fill-current" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isPlaying ? "Pause (Space)" : "Play (Space)"}</p>
                </TooltipContent>
              </Tooltip>

              {!isLive && (
                <div className="flex items-center gap-1 sm:gap-2">
                    <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={skipBackward} className="relative text-white hover:bg-white/20 hover:text-white h-8 w-8 sm:h-9 sm:w-9">
                          <RotateCcw className="h-5 w-5 sm:h-6 sm:w-6" />
                          <span className="absolute text-[8px] sm:text-[9px] font-bold top-1/2 left-1/2 -translate-x-1/2 -translate-y-[2px]">10</span>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Rewind 10s (←)</p>
                    </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={skipForward} className="relative text-white hover:bg-white/20 hover:text-white h-8 w-8 sm:h-9 sm:w-9">
                          <RotateCw className="h-5 w-5 sm:h-6 sm:w-6" />
                          <span className="absolute text-[8px] sm:text-[9px] font-bold top-1/2 left-1/2 -translate-x-1/2 -translate-y-[2px]">10</span>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Forward 10s (→)</p>
                    </TooltipContent>
                    </Tooltip>
                </div>
              )}

              <div className="flex items-center gap-2 group/vol ml-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={toggleMute} className="text-white hover:bg-white/20 hover:text-white h-8 w-8 hidden sm:inline-flex">
                      {isMuted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{isMuted ? "Unmute (M)" : "Mute (M)"}</p>
                    </TooltipContent>
                  </Tooltip>

                  <div className="w-0 overflow-hidden group-hover/vol:w-20 transition-all duration-300 ease-out hidden sm:block">
                      <Slider
                          value={[isMuted ? 0 : volume]}
                          min={0}
                          max={100}
                          onValueChange={handleVolumeChange}
                          className="w-20 cursor-pointer"
                      />
                  </div>
              </div>

              <span className="text-white text-[10px] sm:text-sm font-mono ml-2 select-none">
                {isLive ? (
                   <span className="text-red-500 font-bold">LIVE</span>
                ) : (
                   `${formatTime(currentTime)} / ${formatTime(duration)}`
                )}
              </span>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              {availableQualities.length > 0 && (
                  <DropdownMenu>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-white hover:bg-white/20 hover:text-white gap-1 min-w-[2rem] sm:min-w-[3rem] h-8 px-1 sm:px-2">
                                  <MonitorPlay className="h-4 w-4" />
                                  <span className="text-xs font-bold uppercase hidden sm:inline">{currentQuality}</span>
                              </Button>
                          </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent>Quality</TooltipContent>
                      </Tooltip>
                      <DropdownMenuContent container={containerRef.current} align="end" side="top" className="max-h-60 overflow-y-auto bg-black/90 border-white/20 text-white backdrop-blur-md">
                          {availableQualities.map((q) => (
                              <DropdownMenuItem key={q} onClick={() => handleQualityChange(q)} className="focus:bg-white/20 focus:text-white cursor-pointer justify-center font-mono text-xs">
                                  {q.toUpperCase()}
                              </DropdownMenuItem>
                          ))}
                      </DropdownMenuContent>
                  </DropdownMenu>
              )}

              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-white hover:bg-white/20 hover:text-white gap-1 min-w-[2rem] sm:min-w-[3rem] h-8 px-1 sm:px-2">
                        <Settings className="h-4 w-4" />
                        <span className="text-xs font-bold hidden sm:inline">{playbackRate}x</span>
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Speed</TooltipContent>
                </Tooltip>
                <DropdownMenuContent container={containerRef.current} align="end" side="top" className="bg-black/90 border-white/20 text-white backdrop-blur-md">
                  {[1, 1.25, 1.5, 1.75, 2, 2.5, 2.75, 3].map((rate) => (
                    <DropdownMenuItem key={rate} onClick={() => handlePlaybackRate(rate)} className="focus:bg-white/20 focus:text-white cursor-pointer justify-center font-mono text-xs">
                      {rate === 1 ? "Normal" : `${rate}x`}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={toggleFullscreen} className="text-white hover:bg-white/20 hover:text-white h-8 w-8 sm:h-9 sm:w-9">
                    {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isFullscreen ? "Exit Fullscreen (F)" : "Fullscreen (F)"}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Centered Play Icon (Initial or Paused) — no background circle so it doesn't hide content behind it */}
        {!isPlaying && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-[5]"
            >
                <Play className="h-8 w-8 sm:h-10 sm:w-10 text-white fill-white ml-1 drop-shadow-lg animate-in zoom-in-50 duration-300" />
            </div>
        )}
      </div>
    </TooltipProvider>
  );
};

export default ClassPlayer;
