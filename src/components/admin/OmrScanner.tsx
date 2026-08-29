import React, { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Camera,
  Upload,
  ScanLine,
  Loader2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  RotateCw,
  Import,
  AlertTriangle,
  Info,
  X,
  Check,
  Hash,
} from "lucide-react";
import { QuestionData } from "@/components/admin/QuestionEditor";

// OMR API URL — set this to your Render deployment
const OMR_API_URL = import.meta.env.VITE_OMR_API_URL || "http://127.0.0.1:8000";
const OMR_API_KEY = import.meta.env.VITE_OMR_API_KEY || "";

interface OmrScannerProps {
  onImportQuestions: (questions: QuestionData[]) => void;
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

type ScannerStep = "upload" | "crop" | "scanning" | "results";

export const OmrScanner = ({ onImportQuestions }: OmrScannerProps) => {
  const { toast } = useToast();
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
    { x: 10, y: 10 }, // TL
    { x: 90, y: 10 }, // TR
    { x: 90, y: 90 }, // BR
    { x: 10, y: 90 }, // BL
  ]);
  const [draggingPoint, setDraggingPoint] = useState<number | null>(null);

  // Scanning
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Results
  const [apiData, setApiData] = useState<ApiData | null>(null);
  const [historyArray, setHistoryArray] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Canvas for bubble visualization
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);

  // Handle file selection
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file",
        description: "Please select an image file.",
        variant: "destructive",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setRawImage(reader.result as string);
      setStep("crop");
      setScanError(null);
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
    
    // Scale down if huge (improves performance & fixes EXIF rotation bugs)
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

  // Skip crop - send full image without perspective corners
  const handleSkipCrop = () => {
    if (!rawImage || !imageRef.current) return;
    getNormalizedImageBlob(imageRef.current, (blob) => {
      handleScan(blob, null);
    });
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
      const spinToOptions: Record<number, string> = {
        0: "A",
        1: "B",
        2: "C",
        3: "D",
      };

      const decodedBubbleMap: BubbleData[] = tensorNodes.map(
        (node: {
          n_idx: number;
          spin_state: number;
          alpha_v: number;
          beta_v: number;
        }) => ({
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
      setHistoryArray([JSON.stringify(newApiData.results)]);
      setHistoryIndex(0);

      // Load warped image for canvas
      const img = new Image();
      img.onload = () => { setBaseImage(img); };
      if (data.warped_image) {
        img.src = data.warped_image;
      } else {
        img.src = URL.createObjectURL(imageBlob);
      }

      setStep("results");
      toast({ title: "Scan Complete", description: `Detected ${data.extracted_nodes.length} questions.` });
    } catch (err) {
      console.error("OMR scan error:", err);
      const msg =
        err instanceof Error
          ? err.message
          : "Could not connect to OMR server.";
      setScanError(msg);
      // Stay on crop to show warped image
      setStep(rawImage ? "crop" : "upload");
      toast({
        title: "Scan Failed",
        description: msg,
        variant: "destructive",
      });
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
    ctx.fillStyle = "rgba(239, 68, 68, 0.85)";
    apiData.results.forEach((qData) => {
      if (qData.correct_answer === "") return;
      const selectedOptions = qData.correct_answer.split(", ");
      const qNum = parseInt(qData.question);

      selectedOptions.forEach((opt) => {
        const bubble = apiData.bubble_map.find(
          (b) => b.q === qNum && b.opt === opt
        );
        if (bubble) {
          ctx.beginPath();
          ctx.arc(bubble.x, bubble.y, apiData.radius - 1, 0, 2 * Math.PI);
          ctx.fill();
        }
      });
    });
  }, [apiData, baseImage]);

  // Re-draw whenever image or data changes
  useEffect(() => {
    if (step === "results" && baseImage && apiData) {
      drawCanvas();
    }
  }, [step, baseImage, apiData, drawCanvas]);

  // Handle bubble click on canvas
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!apiData) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;
    const clickTolerance = apiData.radius + 10;

    let clickedBubble: BubbleData | null = null;
    for (const b of apiData.bubble_map) {
      if (
        Math.sqrt(
          Math.pow(b.x - clickX, 2) + Math.pow(b.y - clickY, 2)
        ) <= clickTolerance
      ) {
        clickedBubble = b;
        break;
      }
    }

    if (clickedBubble) {
      const newResults = [...apiData.results];
      const resultItem = newResults.find(
        (r) => parseInt(r.question) === clickedBubble!.q
      );
      if (!resultItem) return;

      let currentAnsArray = resultItem.correct_answer
        .split(", ")
        .filter((a) => a !== "");

      if (currentAnsArray.includes(clickedBubble.opt)) {
        currentAnsArray = currentAnsArray.filter(
          (a) => a !== clickedBubble!.opt
        );
      } else {
        currentAnsArray.push(clickedBubble.opt);
      }

      resultItem.correct_answer = currentAnsArray.sort().join(", ");

      // Save state for undo
      const newHistory = historyArray.slice(0, historyIndex + 1);
      newHistory.push(JSON.stringify(newResults));

      setApiData({ ...apiData, results: newResults });
      setHistoryArray(newHistory);
      setHistoryIndex(newHistory.length - 1);
      drawCanvas();
    }
  };

  // Undo / Redo
  const handleUndo = () => {
    if (historyIndex > 0 && apiData) {
      const newIdx = historyIndex - 1;
      const results = JSON.parse(historyArray[newIdx]);
      setApiData({ ...apiData, results });
      setHistoryIndex(newIdx);
    }
  };

  const handleRedo = () => {
    if (historyIndex < historyArray.length - 1 && apiData) {
      const newIdx = historyIndex + 1;
      const results = JSON.parse(historyArray[newIdx]);
      setApiData({ ...apiData, results });
      setHistoryIndex(newIdx);
    }
  };

  // Import results into ExamCreator
  const handleImport = () => {
    if (!apiData) return;

    const questions: QuestionData[] = apiData.results
      .filter((r) => parseInt(r.question) <= 100)
      .map((r) => ({
        question: `Question ${r.question}`,
        options: { A: "", B: "", C: "", D: "" },
        correct_answer: r.correct_answer.split(", ")[0] || "", // Take first answer
        explanation: "",
      }));

    onImportQuestions(questions);
    toast({
      title: "Imported!",
      description: `${questions.length} questions imported from OMR scan.`,
    });
  };

  // Reset to start
  const handleReset = () => {
    setRawImage(null);
    setApiData(null);
    setBaseImage(null);
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

  if (!isExpanded) {
    return (
      <Card
        className="border border-border/60 bg-card cursor-pointer hover:border-primary/40 transition-all"
        onClick={() => setIsExpanded(true)}
      >
        <div className="flex items-center justify-between p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <ScanLine className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm sm:text-base">
                OMR Scanner
              </h3>
              <p className="text-xs text-muted-foreground">
                Scan OMR sheet to auto-fill answers (100 Questions)
              </p>
            </div>
          </div>
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-primary/30 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border/50 bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ScanLine className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-base sm:text-lg">OMR Scanner</h3>
            <p className="text-xs text-muted-foreground">
              Upload or capture OMR sheet image • 100 Questions • 4 Columns
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsExpanded(false)}
          className="rounded-full h-8 w-8"
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-4 sm:p-6 space-y-5">
        {/* Warning Note */}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-800 dark:text-amber-300 space-y-1">
            <p className="font-semibold">For best results:</p>
            <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
              <li>Ensure proper lighting — avoid shadows and glare</li>
              <li>Keep the OMR sheet flat and fully visible</li>
              <li>Use a clear, high-resolution image</li>
              <li>Corner squares must be visible for auto-alignment</li>
            </ul>
          </div>
        </div>

        {/* Sheet Info */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>
            Col 1: Q1-25 • Col 2: Q26-50 • Col 3: Q51-75 • Col 4: Q76-100 • 4 columns • 25 Q/column
          </span>
        </div>

        {/* Error Alert available in upload and crop steps */}
        {scanError && (step === "upload" || step === "crop") && (
          <div className="flex items-start gap-2 p-3 mb-4 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 text-xs text-red-700 dark:text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Scan Failed</p>
              <p>{scanError}</p>
            </div>
          </div>
        )}

        {/* Step: Upload */}
        {step === "upload" && (
          <div className="space-y-4">
            {/* Upload Zone */}
            <div className="border-2 border-dashed border-border/60 rounded-2xl p-8 text-center hover:border-primary/40 transition-colors">
              <div className="flex flex-col items-center gap-3">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Upload className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Upload OMR Sheet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    JPG, PNG — Clear photo of the OMR sheet
                  </p>
                </div>
                <div className="flex gap-3 mt-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-full px-5"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Choose File
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cameraInputRef.current?.click()}
                    className="rounded-full px-5"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Camera
                  </Button>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageSelect}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleImageSelect}
              />
            </div>
          </div>
        )}

        {/* Step: Crop */}
        {step === "crop" && rawImage && (
          <div className="space-y-4">
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
                    fill="rgba(59, 130, 246, 0.2)"
                    stroke="rgba(59, 130, 246, 0.8)"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                  />
                  
                  {/* 4 Draggable corner handles with bullseyes */}
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
                        stroke="rgba(59, 130, 246, 1)"
                        strokeWidth="3"
                        className="cursor-move"
                        onPointerDown={() => handlePointerDown(i)}
                      />
                      
                      {/* Center crosshair dot */}
                      <circle cx={`${p.x}%`} cy={`${p.y}%`} r="3" fill="rgba(59, 130, 246, 1)" className="pointer-events-none" />
                    </g>
                  ))}
                </svg>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRawImage(null);
                  setStep("upload");
                }}
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSkipCrop}
                  className="rounded-full"
                >
                  Skip Crop
                </Button>
                <Button
                  size="sm"
                  onClick={handleCrop}
                  className="rounded-full px-6 bg-primary hover:bg-primary/90"
                >
                  <ScanLine className="h-4 w-4 mr-2" />
                  Crop & Scan
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Scanning */}
        {step === "scanning" && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <div className="text-center">
              <p className="font-semibold">Scanning OMR Sheet...</p>
              <p className="text-xs text-muted-foreground mt-1">
                Detecting bubbles, reading Roll No & Reg No
              </p>
            </div>
          </div>
        )}

        {/* Step: Results */}
        {step === "results" && apiData && (
          <div className="space-y-4">
            {/* Roll No & Reg No Display */}
            {(apiData.roll_no || apiData.reg_no) && (
              <div className="flex flex-wrap items-center gap-4 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30">
                <Hash className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <div className="flex flex-wrap gap-4 text-sm">
                  {apiData.roll_no && (
                    <div>
                      <span className="text-xs text-muted-foreground">Roll No: </span>
                      <span className="font-bold text-blue-700 dark:text-blue-300 font-mono tracking-wider">{apiData.roll_no}</span>
                    </div>
                  )}
                  {apiData.reg_no && (
                    <div>
                      <span className="text-xs text-muted-foreground">Reg No: </span>
                      <span className="font-bold text-blue-700 dark:text-blue-300 font-mono tracking-wider">{apiData.reg_no}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleUndo}
                disabled={historyIndex <= 0}
                className="rounded-full"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Undo
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRedo}
                disabled={historyIndex >= historyArray.length - 1}
                className="rounded-full"
              >
                <RotateCw className="h-4 w-4 mr-1" />
                Redo
              </Button>
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="rounded-full"
              >
                <X className="h-4 w-4 mr-1" />
                Re-scan
              </Button>
              <Button
                size="sm"
                onClick={handleImport}
                className="rounded-full px-5 bg-green-600 hover:bg-green-700"
              >
                <Import className="h-4 w-4 mr-1" />
                Import Answers
              </Button>
            </div>

            {/* Canvas + Answers Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Canvas View */}
              <div className="rounded-xl overflow-hidden border border-border/60 bg-black/5">
                <div className="overflow-auto max-h-[500px]">
                  <canvas
                    ref={canvasRef}
                    onClick={handleCanvasClick}
                    className="cursor-crosshair w-full"
                    style={{ maxWidth: "100%" }}
                  />
                </div>
                <div className="p-2 bg-muted/30 text-[10px] text-muted-foreground text-center">
                  Click bubbles to toggle answers
                </div>
              </div>

              {/* Answers Grid */}
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <div className="p-3 bg-muted/30 border-b border-border/50 flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    Detected Answers
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {
                      apiData.results.filter(
                        (r) =>
                          r.correct_answer !== "" &&
                          parseInt(r.question) <= 100
                      ).length
                    }
                    /100 answered
                  </span>
                </div>
                <div className="max-h-[440px] overflow-y-auto p-3">
                  <div className="grid grid-cols-5 gap-2">
                    {apiData.results
                      .filter(
                        (r) => parseInt(r.question) <= 100
                      )
                      .map((r) => {
                        const hasAnswer = r.correct_answer !== "";
                        return (
                          <div
                            key={r.question}
                            className={`flex flex-col items-center p-2 rounded-lg text-xs border transition-colors ${
                              hasAnswer
                                ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800/30"
                                : "bg-muted/30 border-border/30"
                            }`}
                          >
                            <span className="font-bold text-[10px] text-muted-foreground">
                              Q{r.question}
                            </span>
                            <span
                              className={`font-bold mt-0.5 ${
                                hasAnswer
                                  ? "text-green-700 dark:text-green-400"
                                  : "text-muted-foreground/50"
                              }`}
                            >
                              {hasAnswer ? r.correct_answer : "—"}
                            </span>
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
