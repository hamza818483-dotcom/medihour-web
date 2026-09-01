import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2, Upload, X, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ImageUploaderProps {
  value?: string;
  onChange: (url: string) => void;
  className?: string;
  placeholder?: string;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

export function ImageUploader({ value, onChange, className, placeholder = "Image URL" }: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { toast } = useToast();
  const inputId = React.useId();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "File too large",
        description: "Image size should be less than 25MB.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('https://imagehost-sigma-five.vercel.app/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer jm4rt3hbicI7u0cutBmdQYNC95PCXvzN'
        },
        body: formData
      });

      if (!res.ok) {
        throw new Error(`Upload failed: ${res.statusText}`);
      }

      const data = await res.json();
      if (data.direct_url) {
        onChange(data.direct_url);
        toast({
          title: "Image uploaded",
          description: "Image uploaded successfully.",
        });
      } else {
        throw new Error("No URL returned from server");
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: "Could not upload image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      // Reset input value so same file can be selected again if needed
      e.target.value = "";
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex gap-2 items-center">
        <Input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1"
        />
        <div className="relative">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => document.getElementById(inputId)?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
          </Button>
          <input
            id={inputId}
            type="file"
            className="hidden"
            accept="image/*"
            onChange={handleFileUpload}
          />
        </div>
      </div>

      {value && (
        <>
          <div className="relative rounded-md border overflow-hidden w-40 h-24 bg-muted/30 group cursor-pointer" onClick={() => setPreviewOpen(true)}>
            <img
              src={value}
              alt="Preview"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = ""; // Clear broken src
                (e.target as HTMLImageElement).parentElement?.classList.add("hidden"); // Hide container if broken
              }}
            />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
            <DialogContent className="max-w-3xl p-2 bg-transparent border-none shadow-none">
              <img src={value} alt="Full preview" className="w-full h-auto max-h-[85vh] object-contain rounded-md" />
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

interface MultiImageUploaderProps {
  values: string[];
  onChange: (urls: string[]) => void;
  className?: string;
}

export function MultiImageUploader({ values, onChange, className }: MultiImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const { toast } = useToast();
  const inputId = React.useId();

  const uploadOne = async (file: File): Promise<string | null> => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file type", description: `${file.name} is not an image.`, variant: "destructive" });
      return null;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "File too large", description: `${file.name} exceeds 25MB.`, variant: "destructive" });
      return null;
    }
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('https://imagehost-sigma-five.vercel.app/api/upload', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer jm4rt3hbicI7u0cutBmdQYNC95PCXvzN' },
      body: formData,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
    const data = await res.json();
    return data.direct_url || null;
  };

  const handleFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    const uploaded: string[] = [];
    try {
      for (const file of files) {
        try {
          const url = await uploadOne(file);
          if (url) uploaded.push(url);
        } catch (err) {
          console.error("Upload error:", err);
          toast({ title: "Upload failed", description: `Could not upload ${file.name}.`, variant: "destructive" });
        }
      }
      if (uploaded.length > 0) {
        onChange([...values, ...uploaded]);
        toast({ title: "Images uploaded", description: `${uploaded.length} image(s) uploaded successfully.` });
      }
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const removeAt = (idx: number) => {
    onChange(values.filter((_, i) => i !== idx));
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="relative w-fit">
        <Button
          type="button"
          variant="outline"
          onClick={() => document.getElementById(inputId)?.click()}
          disabled={isUploading}
          className="gap-2"
        >
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {isUploading ? "Uploading..." : "Add Images"}
        </Button>
        <input
          id={inputId}
          type="file"
          className="hidden"
          accept="image/*"
          multiple
          onChange={handleFilesUpload}
        />
      </div>

      {values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {values.map((url, idx) => (
            <div key={idx} className="relative rounded-md border overflow-hidden w-24 h-24 bg-muted/30 group cursor-pointer" onClick={() => setPreviewUrl(url)}>
              <img src={url} alt={`Image ${idx + 1}`} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeAt(idx);
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!previewUrl} onOpenChange={(open) => !open && setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl p-2 bg-transparent border-none shadow-none">
          {previewUrl && <img src={previewUrl} alt="Full preview" className="w-full h-auto max-h-[85vh] object-contain rounded-md" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
