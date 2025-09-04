import { Input } from "@/components/ui/input";
import { Label } from "@radix-ui/react-label";
import React, { ChangeEvent, useRef, useState } from "react";

function FileInput({
  onFileSelected,
}: {
  onFileSelected: (file: File | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;

    // Reset error
    setError(null);

    if (!file) {
      onFileSelected(null);
      return;
    }

    // Check file type
    if (!file.type.startsWith("video/")) {
      setError("Please select a video file.");
      onFileSelected(null);
      return;
    }

    // Check file size (1.5 GB = 1.5 * 1024 * 1024 * 1024 bytes)
    const maxSizeBytes = 1.5 * 1024 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setError("File size must be less than 1.5 GB.");
      onFileSelected(null);
      return;
    }

    // File is valid
    onFileSelected(file);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="video-upload">Upload Video</Label>
      <Input
        id="video-upload"
        type="file"
        accept="video/*"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="w-full"
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

export default FileInput;
