import React, { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Camera,
  Upload,
  ScanLine,
  Loader2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  RotateCw,
  AlertTriangle,
  Info,
  X,
  Check,
  Hash,
  ShieldCheck,
  ShieldX,
  ZoomIn,
  ZoomOut,
  Maximize,
} from "lucide-react";

// OMR API URL — set this to your Render deployment
const OMR_API_URL = import.meta.env.VITE_OMR_API_URL || "http://127.0.0.1:8000";
const OMR_API_KEY = import.meta.env.VITE_OMR_API_KEY || "";

interface OmrExamScannerProps {
  /** Ordered question IDs from the exam, used to map scanned Q1→questions[0].id etc. */
  questionIds: string[];
  /** Current answers state */
  answers: Record<string, string>;
  /** Callback to update answers (auto-fill from OMR scan) */
  onFillAnswers: (filledAnswers: Record<string, string>) => void;
}

interface OmrResult {
  question: string;
  options: { A: string; B: string; C: string; D: string };
  correct_answer: string;
  explanation: string;
}

interface BubbleData {
  q: number;
  opt: string;
  x: number;
  y: number;
}

interface ApiData {
  image_width: number;
  image_height: number;
  radius: number;
  results: OmrResult[];
  bubble_map: BubbleData[];
  roll_no: string;
  reg_no: string;
}

type ScannerStep = "upload" | "preview" | "crop" | "scanning" | "results";

export const OmrExamScanner = ({ questionIds, answers, onFillAnswers }: OmrExamScannerProps) => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [step, setStep] = useState<ScannerStep>("upload");

  // Image & crop
  const [rawImage, setRawImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);

  // 4 points for perspective crop (percentages 0-100)
  const [points, setPoints] = useState([
    { x: 10, y: 10 },
    { x: 90, y: 10 },
    { x: 90, y: 90 },
    { x: 10, y: 90 },
  ]);
  const [draggingPoint, setDraggingPoint] = useState<number | null>(null);

  // Scanning
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Results
  const [apiData, setApiData] = useState<ApiData | null>(null);
  const [scannedAnswers, setScannedAnswers] = useState<Record<string, string>>({});
  const [historyArray, setHistoryArray] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Canvas for bubble visualization
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);

  // Pinch-to-zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoomContainerRef = useRef<HTMLDivElement>(null);
  const lastTouchDist = useRef<number | null>(null);
  const lastTouchCenter = useRef<{ x: number; y: number } | null>(null);
  const isPanning = useRef(false);
  const lastPanPoint = useRef<{ x: number; y: number } | null>(null);
  const touchStartTime = useRef(0);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const lastTapTime = useRef(0);

  // Applied state
  const [hasApplied, setHasApplied] = useState(false);

  // Handle file selection
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setRawImage(reader.result as string);
      setScanError(null);
      setStep("preview");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Pointer events for dragging SVG points
  const handlePointerDown = (index: number) => {
    setDraggingPoint(index);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (draggingPoint === null || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    let x = ((e.clientX - rect.left) / rect.width) * 100;
    let y = ((e.clientY - rect.top) / rect.height) * 100;
    
    // Clamp to 0-100
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));

    const newPoints = [...points];
    newPoints[draggingPoint] = { x, y };
    setPoints(newPoints);
  };

  const handlePointerUp = () => {
    setDraggingPoint(null);
  };

  // Helper to normalize image rotation and size via Canvas
  const getNormalizedImageBlob = (img: HTMLImageElement, callback: (blob: Blob, width: number, height: number) => void) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const MAX_DIM = 1600;
    let width = img.naturalWidth;
    let height = img.naturalHeight;
    
    if (width > MAX_DIM || height > MAX_DIM) {
      if (width > height) {
        height = Math.round((height * MAX_DIM) / width);
        width = MAX_DIM;
      } else {
        width = Math.round((width * MAX_DIM) / height);
        height = MAX_DIM;
      }
    }
    
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);
    
    canvas.toBlob((blob) => {
      if (blob) callback(blob, width, height);
    }, "image/jpeg", 0.85);
  };

  // Apply perspective crop
  const handleCrop = () => {
    if (!rawImage || !imageRef.current) return;
    
    getNormalizedImageBlob(imageRef.current, (blob, width, height) => {
      const corners = points.map(p => ({
        x: (p.x / 100) * width,
        y: (p.y / 100) * height
      }));
      handleScan(blob, corners);
    });
  };

  // Skip crop - send full image without perspective corners
  const handleSkipCrop = () => {
    if (!rawImage || !imageRef.current) return;
    getNormalizedImageBlob(imageRef.current, (blob) => {
      handleScan(blob, null);
    });
  };

  // Verify Roll/Reg against logged-in user
  const verifyCredentials = (scannedRoll: string, scannedReg: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profileAny = profile as any;
    const userRoll = profileAny?.omr_roll_no || "";
    const userReg = profileAny?.omr_reg_no || "";

    if (!userRoll || !userReg) {
      return { status: "no_credentials" as const, message: "You haven't generated OMR credentials yet" };
    }

    const rollMatch = scannedRoll === userRoll;
    const regMatch = scannedReg === userReg;

    if (rollMatch && regMatch) {
      return { status: "verified" as const, message: "Roll & Reg No verified ✅" };
    } else {
      const mismatches = [];
      if (!rollMatch && scannedRoll) mismatches.push(`Roll: scanned ${scannedRoll} ≠ yours ${userRoll}`);
      if (!regMatch && scannedReg) mismatches.push(`Reg: scanned ${scannedReg} ≠ yours ${userReg}`);
      return { status: "mismatch" as const, message: mismatches.join(" • ") || "Could not read Roll/Reg from sheet" };
    }
  };

  // Send to API
  const handleScan = async (imageBlob: Blob, corners: any[] | null) => {
    setStep("scanning");
    setIsScanning(true);
    setScanError(null);

    try {
      const formData = new FormData();
      formData.append("file", imageBlob, "omr.jpg");
      if (corners) {
        formData.append("corners", JSON.stringify(corners));
      }

      const response = await fetch(`${OMR_API_URL}/api/v1/scan-omr`, {
        method: "POST",
        headers: {
          "X-API-Key": OMR_API_KEY,
        },
        body: formData,
      });

      const data = await response.json();
      
      if (data.error) {
        if (data.warped_image) {
          setRawImage(data.warped_image);
          setPoints([
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
          ]);
        }
        throw new Error(data.error);
      }

      // Decode cipher_matrix
      const decodedStr = atob(data.cipher_matrix);
      const tensorNodes = JSON.parse(decodedStr);
      const spinToOptions: Record<number, string> = { 0: "A", 1: "B", 2: "C", 3: "D" };

      const decodedBubbleMap: BubbleData[] = tensorNodes.map(
        (node: { n_idx: number; spin_state: number; alpha_v: number; beta_v: number }) => ({
          q: node.n_idx,
          opt: spinToOptions[node.spin_state],
          x: (node.alpha_v - 42.0) / 3.14159,
          y: (node.beta_v + 15.0) / 2.71828,
        })
      );

      const newApiData: ApiData = {
        image_width: data.image_width,
        image_height: data.image_height,
        radius: data.radius,
        results: data.extracted_nodes,
        bubble_map: decodedBubbleMap,
        roll_no: data.roll_no || "",
        reg_no: data.reg_no || "",
      };

      setApiData(newApiData);

      // Map scanned results to question IDs
      const mapped: Record<string, string> = {};
      data.extracted_nodes.forEach((r: OmrResult) => {
        const qNum = parseInt(r.question);
        if (qNum <= questionIds.length && r.correct_answer) {
          // Take only the first answer (single choice)
          const firstAnswer = r.correct_answer.split(", ")[0];
          if (firstAnswer && ["A", "B", "C", "D"].includes(firstAnswer)) {
            mapped[questionIds[qNum - 1]] = firstAnswer;
          }
        }
      });

      setScannedAnswers(mapped);
      setHistoryArray([JSON.stringify(mapped)]);
      setHistoryIndex(0);

      // Auto-apply immediately on scan so the outer submit button unlocks
      // right after upload — student can still adjust bubbles below and the
      // "Apply" button will re-sync any manual corrections afterward.
      onFillAnswers(mapped);
      setHasApplied(true);

      // Load image for canvas
      const img = new Image();
      img.onload = () => { setBaseImage(img); };
      if (data.warped_image) {
        img.src = data.warped_image;
      } else {
        img.src = URL.createObjectURL(imageBlob);
      }

      setStep("results");
      const filledCount = Object.keys(mapped).length;
      if (data.warning === "sheet_not_straightened") {
        toast({
          title: "ছবিটি সোজা করা যায়নি",
          description: "শিট বাঁকা মনে হচ্ছে — ফলাফল সঠিক না হলে ভালো আলোয়, সোজাভাবে আবার ছবি তুলে দেখুন।",
          variant: "destructive",
        });
      } else {
        toast({ title: "Scan Complete", description: `Detected answers for ${filledCount}/${questionIds.length} questions.` });
      }
    } catch (err) {
      console.error("OMR scan error:", err);
      const msg = err instanceof Error ? err.message : "Could not connect to OMR server.";
      setScanError(msg);
      setStep(rawImage ? "crop" : "upload");
      toast({ title: "Scan Failed", description: msg, variant: "destructive" });
    } finally {
      setIsScanning(false);
    }
  };

  // Draw canvas with bubble overlays
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !baseImage || !apiData) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = apiData.image_width;
    canvas.height = apiData.image_height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);

    // Draw filled bubbles
    ctx.fillStyle = "rgba(34, 197, 94, 0.85)";
    apiData.results.forEach((qData) => {
      if (qData.correct_answer === "") return;
      const selectedOptions = qData.correct_answer.split(", ");
      const qNum = parseInt(qData.question);

      selectedOptions.forEach((opt) => {
        const bubble = apiData.bubble_map.find(b => b.q === qNum && b.opt === opt);
        if (bubble) {
          ctx.beginPath();
          ctx.arc(bubble.x, bubble.y, apiData.radius - 1, 0, 2 * Math.PI);
          ctx.fill();
        }
      });
    });
  }, [apiData, baseImage]);

  // Re-draw whenever image or data changes, or panel re-expands
  useEffect(() => {
    if (step === "results" && baseImage && apiData && isExpanded) {
      // Small delay to ensure canvas is mounted in DOM
      const timer = setTimeout(() => drawCanvas(), 50);
      return () => clearTimeout(timer);
    }
  }, [step, baseImage, apiData, drawCanvas, isExpanded]);

  // Toggle a bubble at canvas coordinates
  const toggleBubbleAt = useCallback((canvasX: number, canvasY: number) => {
    if (!apiData) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = canvasX * scaleX;
    const clickY = canvasY * scaleY;
    const clickTolerance = (apiData.radius + 10) * Math.max(1, 2 / zoom);

    let clickedBubble: BubbleData | null = null;
    let closestDist = Infinity;
    for (const b of apiData.bubble_map) {
      const dist = Math.sqrt(Math.pow(b.x - clickX, 2) + Math.pow(b.y - clickY, 2));
      if (dist <= clickTolerance && dist < closestDist) {
        closestDist = dist;
        clickedBubble = b;
      }
    }

    if (clickedBubble) {
      const newResults = [...apiData.results];
      const resultItem = newResults.find(r => parseInt(r.question) === clickedBubble!.q);
      if (!resultItem) return;

      let currentAnsArray = resultItem.correct_answer.split(", ").filter(a => a !== "");

      if (currentAnsArray.includes(clickedBubble.opt)) {
        currentAnsArray = currentAnsArray.filter(a => a !== clickedBubble!.opt);
      } else {
        // For exam answers, only allow single selection, so replace
        currentAnsArray = [clickedBubble.opt];
      }

      resultItem.correct_answer = currentAnsArray.sort().join(", ");

      // Rebuild scanned answers mapping
      const mapped: Record<string, string> = {};
      newResults.forEach((r) => {
        const qNum = parseInt(r.question);
        if (qNum <= questionIds.length && r.correct_answer) {
          const firstAnswer = r.correct_answer.split(", ")[0];
          if (firstAnswer && ["A", "B", "C", "D"].includes(firstAnswer)) {
            mapped[questionIds[qNum - 1]] = firstAnswer;
          }
        }
      });

      const newHistory = historyArray.slice(0, historyIndex + 1);
      newHistory.push(JSON.stringify(mapped));

      setApiData({ ...apiData, results: newResults });
      setScannedAnswers(mapped);
      setHasApplied(false);
      setHistoryArray(newHistory);
      setHistoryIndex(newHistory.length - 1);
      drawCanvas();
    }
  }, [apiData, questionIds, historyArray, historyIndex, drawCanvas, zoom]);

  // Directly set (or clear) the answer for a given 1-based question number.
  // Used by the "Detected Answers" grid so users can correct/override a
  // scanned answer without needing to tap the exact bubble on the image.
  const setAnswerForQuestion = useCallback((qNum: number, opt: string | null) => {
    if (!apiData) return;
    const newResults = [...apiData.results];
    const resultItem = newResults.find(r => parseInt(r.question) === qNum);
    if (!resultItem) return;

    resultItem.correct_answer = opt || "";

    const mapped: Record<string, string> = {};
    newResults.forEach((r) => {
      const n = parseInt(r.question);
      if (n <= questionIds.length && r.correct_answer) {
        const firstAnswer = r.correct_answer.split(", ")[0];
        if (firstAnswer && ["A", "B", "C", "D"].includes(firstAnswer)) {
          mapped[questionIds[n - 1]] = firstAnswer;
        }
      }
    });

    const newHistory = historyArray.slice(0, historyIndex + 1);
    newHistory.push(JSON.stringify(mapped));

    setApiData({ ...apiData, results: newResults });
    setScannedAnswers(mapped);
    // Directly re-apply so the outer submit stays unlocked & in sync with
    // the manual correction (no separate "Apply" click required here).
    onFillAnswers(mapped);
    setHasApplied(true);
    setHistoryArray(newHistory);
    setHistoryIndex(newHistory.length - 1);
    drawCanvas();
  }, [apiData, questionIds, historyArray, historyIndex, drawCanvas, onFillAnswers]);

  const [editingQNum, setEditingQNum] = useState<number | null>(null);

  // Handle canvas click (mouse) — suppressed after touch taps to prevent double-fire
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Suppress synthetic click events fired by the browser after a touch tap
    if (Date.now() - lastTapTime.current < 400) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    toggleBubbleAt(e.clientX - rect.left, e.clientY - rect.top);
  };

  // ---- Pinch-to-zoom touch handlers ----
  const getTouchDist = (t1: React.Touch, t2: React.Touch) =>
    Math.sqrt(Math.pow(t2.clientX - t1.clientX, 2) + Math.pow(t2.clientY - t1.clientY, 2));

  const getTouchCenter = (t1: React.Touch, t2: React.Touch) => ({
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  });

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch start
      e.preventDefault();
      lastTouchDist.current = getTouchDist(e.touches[0], e.touches[1]);
      lastTouchCenter.current = getTouchCenter(e.touches[0], e.touches[1]);
      isPanning.current = false;
    } else if (e.touches.length === 1) {
      touchStartTime.current = Date.now();
      touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      if (zoom > 1) {
        // Pan start
        isPanning.current = true;
        lastPanPoint.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDist.current !== null) {
      e.preventDefault();
      const newDist = getTouchDist(e.touches[0], e.touches[1]);
      const scale = newDist / lastTouchDist.current;
      setZoom(prev => Math.min(5, Math.max(1, prev * scale)));
      lastTouchDist.current = newDist;

      // Also pan during pinch
      const newCenter = getTouchCenter(e.touches[0], e.touches[1]);
      if (lastTouchCenter.current) {
        const dx = newCenter.x - lastTouchCenter.current.x;
        const dy = newCenter.y - lastTouchCenter.current.y;
        setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      }
      lastTouchCenter.current = newCenter;
    } else if (e.touches.length === 1 && isPanning.current && lastPanPoint.current && zoom > 1) {
      const dx = e.touches[0].clientX - lastPanPoint.current.x;
      const dy = e.touches[0].clientY - lastPanPoint.current.y;
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      lastPanPoint.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      lastTouchDist.current = null;
      lastTouchCenter.current = null;
    }
    if (e.touches.length === 0) {
      // Check if it was a tap (short duration, small movement)
      const duration = Date.now() - touchStartTime.current;
      const startPos = touchStartPos.current;
      if (startPos && duration < 300) {
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const moveDistance = Math.sqrt(
          Math.pow(endX - startPos.x, 2) + Math.pow(endY - startPos.y, 2)
        );
        if (moveDistance < 15) {
          // It's a tap! Toggle bubble and mark time to suppress synthetic click
          e.preventDefault();
          lastTapTime.current = Date.now();
          const canvas = canvasRef.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            toggleBubbleAt(endX - rect.left, endY - rect.top);
          }
        }
      }
      isPanning.current = false;
      lastPanPoint.current = null;
      touchStartPos.current = null;
      // Snap zoom back to 1 if close
      setZoom(prev => (prev < 1.1 ? 1 : prev));
      // Reset pan if zoom is 1
      if (zoom <= 1.1) setPan({ x: 0, y: 0 });
    }
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Undo / Redo
  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIdx = historyIndex - 1;
      setScannedAnswers(JSON.parse(historyArray[newIdx]));
      setHistoryIndex(newIdx);
    }
  };

  const handleRedo = () => {
    if (historyIndex < historyArray.length - 1) {
      const newIdx = historyIndex + 1;
      setScannedAnswers(JSON.parse(historyArray[newIdx]));
      setHistoryIndex(newIdx);
    }
  };

  // Apply scanned answers to the exam
  const handleApply = () => {
    // Check if any existing answers would be overwritten
    const conflicts = Object.keys(scannedAnswers).filter(qId => answers[qId] && answers[qId] !== scannedAnswers[qId]);

    if (conflicts.length > 0) {
      if (!confirm(`${conflicts.length} answers will be overwritten. Continue?`)) return;
    }

    onFillAnswers(scannedAnswers);
    setHasApplied(true);
    toast({
      title: "✅ Answers Applied!",
      description: `${Object.keys(scannedAnswers).length} answers auto-filled from OMR scan.`,
    });
  };

  // Reset
  const handleReset = () => {
    setRawImage(null);
    setApiData(null);
    setBaseImage(null);
    setScannedAnswers({});
    setHistoryArray([]);
    setHistoryIndex(-1);
    setScanError(null);
    setPoints([
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 90, y: 90 },
      { x: 10, y: 90 },
    ]);
    setStep("upload");
  };

  // Compute verification status
  const verificationResult = apiData ? verifyCredentials(apiData.roll_no, apiData.reg_no) : null;

  // Collapsed view
  if (!isExpanded) {
    return (
      <Card
        className="border border-violet-200 dark:border-violet-800/40 bg-violet-50/50 dark:bg-violet-900/10 cursor-pointer hover:border-violet-400 transition-all"
        onClick={() => setIsExpanded(true)}
      >
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <ScanLine className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">📷 OMR Scanner</h3>
              <p className="text-xs text-muted-foreground">Scan OMR sheet to auto-fill your answers (100 Questions)</p>
            </div>
          </div>
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-violet-300 dark:border-violet-700/50 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-violet-200 dark:border-violet-800/40 bg-violet-50/50 dark:bg-violet-900/10">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <ScanLine className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h3 className="font-bold text-sm">📷 OMR Scanner</h3>
            <p className="text-xs text-muted-foreground">Upload or capture your filled OMR sheet • 100 Questions</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsExpanded(false)} className="rounded-full h-8 w-8">
          <ChevronUp className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-4 space-y-4">
        {/* Warning */}
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-800 dark:text-amber-300 space-y-0.5">
            <p className="font-semibold">Tips for best results:</p>
            <p>• Good lighting, no shadows • Flat sheet, fully visible • Clear, focused photo • Corner squares visible</p>
          </div>
        </div>

        {/* Sheet Info */}
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground bg-secondary/50 rounded-lg px-3 py-1.5">
          <Info className="h-3 w-3 shrink-0" />
          <span>4 columns • 25 Q/col • 100 Questions total</span>
        </div>

        {/* Error Alert available in upload, preview and crop steps */}
        {scanError && (step === "upload" || step === "preview" || step === "crop") && (
          <div className="flex items-start gap-2 p-3 mb-4 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 text-xs text-red-700 dark:text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div><p className="font-semibold">Scan Failed</p><p>{scanError}</p></div>
          </div>
        )}

        {/* Step: Upload */}
        {step === "upload" && (
          <div className="space-y-3">
            <div className="border-2 border-dashed border-border/60 rounded-2xl p-6 text-center hover:border-violet-300 transition-colors">
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-violet-400" />
                <p className="font-medium text-sm">Upload OMR Sheet</p>
                <p className="text-xs text-muted-foreground">JPG, PNG — Clear photo</p>
                <div className="flex gap-2 mt-2">
                  <Button variant="default" size="sm" onClick={() => fileInputRef.current?.click()} className="rounded-full px-4 text-xs h-8">
                    <Upload className="h-3.5 w-3.5 mr-1.5" /> Choose File
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => cameraInputRef.current?.click()} className="rounded-full px-4 text-xs h-8">
                    <Camera className="h-3.5 w-3.5 mr-1.5" /> Camera
                  </Button>
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageSelect} />
            </div>
          </div>
        )}

        {/* Step: Preview — image auto-normalized already, just needs a
            single confirm tap before it's sent for scanning. */}
        {step === "preview" && rawImage && (
          <div className="space-y-3">
            <div className="rounded-xl border border-border/60 bg-black/5 overflow-hidden flex justify-center items-center p-3">
              <img ref={imageRef} src={rawImage} alt="Selected OMR sheet" className="max-h-[420px] w-auto rounded-lg" />
            </div>
            <div className="flex items-center justify-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setRawImage(null); setStep("upload"); }} className="text-xs">
                <X className="h-3.5 w-3.5 mr-1" /> বাতিল
              </Button>
              <Button size="sm" onClick={handleSkipCrop} className="rounded-full px-6 text-xs bg-emerald-600 hover:bg-emerald-700">
                <ScanLine className="h-3.5 w-3.5 mr-1.5" /> Scan করুন
              </Button>
            </div>
          </div>
        )}

        {/* Step: Crop */}
        {step === "crop" && rawImage && (
          <div className="space-y-3">
            <div className="rounded-xl border border-border/60 bg-black/5 relative select-none flex justify-center items-center p-3">
              <div className="relative inline-flex max-w-full max-h-[60vh] shadow-sm ring-1 ring-border/50">
                <img
                  ref={imageRef}
                  src={rawImage}
                  alt="Upload preview"
                  className="max-h-[60vh] w-auto max-w-full pointer-events-none block"
                  style={{ userSelect: "none" }}
                />
                <svg
                  ref={overlayRef}
                  className="absolute inset-0 w-full h-full touch-none"
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                >
                  {/* Polygon showing the cropped area */}
                  <polygon
                    points={points.map(p => `${p.x}%,${p.y}%`).join(" ")}
                    fill="rgba(139, 92, 246, 0.2)"
                    stroke="rgba(139, 92, 246, 0.8)"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                  />
                  
                  {/* 4 Draggable corner handles and bullseye crosshairs */}
                  {points.map((p, i) => (
                    <g key={i}>
                      {/* Bullseye lines */}
                      <line x1={`${p.x}%`} y1={`${p.y - 5}%`} x2={`${p.x}%`} y2={`${p.y + 5}%`} stroke="white" strokeWidth="2" className="pointer-events-none opacity-50" />
                      <line x1={`${p.x - 5}%`} y1={`${p.y}%`} x2={`${p.x + 5}%`} y2={`${p.y}%`} stroke="white" strokeWidth="2" className="pointer-events-none opacity-50" />
                      
                      {/* Handle */}
                      <circle
                        cx={`${p.x}%`}
                        cy={`${p.y}%`}
                        r="14"
                        fill="rgba(255,255,255,0.7)"
                        stroke="rgba(139, 92, 246, 1)"
                        strokeWidth="3"
                        className="cursor-move"
                        onPointerDown={() => handlePointerDown(i)}
                      />
                      
                      {/* Center dot */}
                      <circle cx={`${p.x}%`} cy={`${p.y}%`} r="3" fill="rgba(139, 92, 246, 1)" className="pointer-events-none" />
                    </g>
                  ))}
                </svg>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => { setRawImage(null); setStep("upload"); }} className="text-xs">
                <X className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleSkipCrop} className="rounded-full text-xs">Skip Crop</Button>
                <Button size="sm" onClick={handleCrop} className="rounded-full px-5 text-xs bg-violet-600 hover:bg-violet-700">
                  <ScanLine className="h-3.5 w-3.5 mr-1.5" /> Crop & Scan
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Scanning */}
        {step === "scanning" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 text-violet-500 animate-spin" />
            <div className="text-center">
              <p className="font-semibold text-sm">Scanning OMR Sheet...</p>
              <p className="text-xs text-muted-foreground mt-1">Detecting bubbles, reading Roll & Reg No</p>
            </div>
          </div>
        )}

        {/* Step: Results */}
        {step === "results" && apiData && (
          <div className="space-y-3">
            {/* Roll/Reg & Verification */}
            {(apiData.roll_no || apiData.reg_no) && (
              <div className={`flex flex-wrap items-center gap-3 p-3 rounded-xl border ${
                verificationResult?.status === "verified" 
                  ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800/30"
                  : verificationResult?.status === "mismatch"
                  ? "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30"
                  : "bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/30"
              }`}>
                {verificationResult?.status === "verified" ? (
                  <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                ) : verificationResult?.status === "mismatch" ? (
                  <ShieldX className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
                ) : (
                  <Hash className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-3 text-sm">
                    {apiData.roll_no && (
                      <div>
                        <span className="text-xs text-muted-foreground">Roll: </span>
                        <span className="font-bold font-mono tracking-wider">{apiData.roll_no}</span>
                      </div>
                    )}
                    {apiData.reg_no && (
                      <div>
                        <span className="text-xs text-muted-foreground">Reg: </span>
                        <span className="font-bold font-mono tracking-wider">{apiData.reg_no}</span>
                      </div>
                    )}
                  </div>
                  {verificationResult && (
                    <p className={`text-[10px] mt-1 font-medium ${
                      verificationResult.status === "verified" 
                        ? "text-green-700 dark:text-green-400" 
                        : verificationResult.status === "mismatch"
                        ? "text-red-700 dark:text-red-400"
                        : "text-muted-foreground"
                    }`}>
                      {verificationResult.message}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleUndo} disabled={historyIndex <= 0} className="rounded-full text-xs h-7">
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Undo
              </Button>
              <Button variant="outline" size="sm" onClick={handleRedo} disabled={historyIndex >= historyArray.length - 1} className="rounded-full text-xs h-7">
                <RotateCw className="h-3.5 w-3.5 mr-1" /> Redo
              </Button>
              <div className="flex-1" />
              {hasApplied && (
                <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">✅ Applied</span>
              )}
              <Button variant="ghost" size="sm" onClick={handleReset} className="rounded-full text-xs h-7">
                <X className="h-3.5 w-3.5 mr-1" /> Re-scan
              </Button>
              <Button size="sm" onClick={handleApply} className="rounded-full px-4 text-xs h-7 bg-green-600 hover:bg-green-700">
                <Check className="h-3.5 w-3.5 mr-1" /> {hasApplied ? "Re-apply" : "Apply"} {Object.keys(scannedAnswers).length} Answers
              </Button>
            </div>

            {/* Canvas + Answers Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Canvas with pinch-to-zoom */}
              <div className="rounded-xl overflow-hidden border border-border/60 bg-black/5">
                {/* Zoom controls */}
                <div className="flex items-center justify-between px-2 py-1 bg-muted/30 border-b border-border/30">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoom(prev => Math.min(5, prev + 0.5))}>
                      <ZoomIn className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setZoom(prev => Math.max(1, prev - 0.5)); if (zoom <= 1.5) setPan({x:0,y:0}); }}>
                      <ZoomOut className="h-3.5 w-3.5" />
                    </Button>
                    {zoom > 1 && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleResetZoom}>
                        <Maximize className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">{Math.round(zoom * 100)}%</span>
                </div>
                <div
                  ref={zoomContainerRef}
                  className="overflow-hidden max-h-[400px] relative"
                  style={{ touchAction: "none" }}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  <canvas
                    ref={canvasRef}
                    onClick={handleCanvasClick}
                    className="cursor-crosshair w-full"
                    style={{
                      maxWidth: "100%",
                      transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                      transformOrigin: "center center",
                      transition: zoom === 1 ? "transform 0.2s ease" : "none",
                    }}
                  />
                </div>
                <div className="p-1.5 bg-muted/30 text-[10px] text-muted-foreground text-center">
                  {zoom > 1 ? "Drag to pan • Tap bubble to toggle" : "Pinch to zoom • Tap bubble to toggle"}
                </div>
              </div>

              {/* Answers Grid */}
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <div className="p-2.5 bg-muted/30 border-b border-border/50 flex items-center justify-between">
                  <span className="text-xs font-semibold">Detected Answers</span>
                  <span className="text-[10px] text-muted-foreground">
                    {Object.keys(scannedAnswers).length}/{questionIds.length} detected
                  </span>
                </div>
                <div className="max-h-[360px] overflow-y-auto p-2.5">
                  <div className="grid grid-cols-5 gap-1.5">
                    {questionIds.map((qId, idx) => {
                      const answer = scannedAnswers[qId];
                      const qNum = idx + 1;
                      const isEditing = editingQNum === qNum;
                      return (
                        <div key={qId} className="relative">
                          <button
                            type="button"
                            onClick={() => setEditingQNum(isEditing ? null : qNum)}
                            className={`w-full flex flex-col items-center p-1.5 rounded-lg text-xs border transition-colors ${
                              answer
                                ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800/30"
                                : "bg-muted/30 border-border/30"
                            } ${isEditing ? "ring-2 ring-violet-400" : ""}`}
                          >
                            <span className="font-bold text-[9px] text-muted-foreground">Q{qNum}</span>
                            <span className={`font-bold ${answer ? "text-green-700 dark:text-green-400" : "text-muted-foreground/50"}`}>
                              {answer || "—"}
                            </span>
                          </button>
                          {isEditing && (
                            <div className="absolute z-30 top-full left-1/2 -translate-x-1/2 mt-1 flex gap-1 bg-background border border-border rounded-lg shadow-lg p-1.5">
                              {["A", "B", "C", "D"].map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => {
                                    setAnswerForQuestion(qNum, opt === answer ? null : opt);
                                    setEditingQNum(null);
                                  }}
                                  className={`h-7 w-7 rounded-full border text-[11px] font-bold flex items-center justify-center transition-colors ${
                                    answer === opt
                                      ? "bg-green-500 border-green-500 text-white"
                                      : "border-border hover:bg-muted"
                                  }`}
                                >
                                  {opt}
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => {
                                  setAnswerForQuestion(qNum, null);
                                  setEditingQNum(null);
                                }}
                                className="h-7 w-7 rounded-full border border-border text-[11px] flex items-center justify-center hover:bg-muted"
                                aria-label="Clear answer"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};
