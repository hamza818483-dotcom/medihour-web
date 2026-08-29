import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Upload, X, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ImageUploaderProps {
  value?: string;
  onChange: (url: string) => void;
  className?: string;
  placeholder?: string;
}

export function ImageUploader({ value, onChange, className, placeholder = "Image URL" }: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
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

    // Validate file size (e.g., 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Image size should be less than 5MB.",
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
        <div className="relative rounded-md border overflow-hidden w-40 h-24 bg-muted/30 group">
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
              onClick={() => onChange("")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
