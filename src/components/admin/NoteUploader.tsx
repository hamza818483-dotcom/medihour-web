import React, { useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, X } from "lucide-react";

interface NoteUploaderProps {
  onUploaded: (url: string) => void;
}

const MAX_DIM = 1600;

async function imageToJpegBytes(file: File): Promise<{ bytes: Uint8Array; w: number; h: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  const scale = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("Image encode failed"))), "image/jpeg", 0.85)
  );
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h };
}

async function imagesToPdf(files: File[]): Promise<Blob> {
  const pdf = await PDFDocument.create();
  for (const f of files) {
    const { bytes, w, h } = await imageToJpegBytes(f);
    const img = await pdf.embedJpg(bytes);
    const page = pdf.addPage([w, h]);
    page.drawImage(img, { x: 0, y: 0, width: w, height: h });
  }
  const out = await pdf.save();
  return new Blob([out as unknown as BlobPart], { type: "application/pdf" });
}

export const NoteUploader: React.FC<NoteUploaderProps> = ({ onUploaded }) => {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState<string[]>([]);

  const handleFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    const pdfs = files.filter((f) => f.type === "application/pdf");
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (pdfs.length > 0 && images.length > 0) {
      toast({ variant: "destructive", title: "Mix kora jabe na", description: "Sudhu PDF ba sudhu image select koro." });
      return;
    }
    if (pdfs.length > 1) {
      toast({ variant: "destructive", title: "Ekta PDF-i upload kora jabe" });
      return;
    }
    if (pdfs.length === 0 && images.length === 0) {
      toast({ variant: "destructive", title: "Only PDF or images allowed" });
      return;
    }
    setBusy(true);
    setNames(files.map((f) => f.name));
    try {
      const blob = pdfs.length === 1 ? pdfs[0] : await imagesToPdf(images);
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user?.id || "staff";
      const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
      const { error } = await supabase.storage
        .from("class-notes")
        .upload(path, blob, { contentType: "application/pdf", upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("class-notes").getPublicUrl(path);
      onUploaded(data.publicUrl);
      toast({ title: "Note uploaded", description: "Notes URL auto-fill hoyeche." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Upload failed", description: e?.message || "Try again" });
      setNames([]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
          {busy ? "Uploading..." : "Upload PDF / Images"}
        </Button>
        {names.length > 0 && !busy && (
          <button type="button" className="text-xs text-muted-foreground inline-flex items-center gap-1" onClick={() => setNames([])}>
            {names.length} file <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">Multiple image select korle auto ekta PDF hoye upload hobe.</p>
    </div>
  );
};

export default NoteUploader;
