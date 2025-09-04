import { useEffect, useRef, useState } from "react";

export function VideoThumbnail({ file }: { file: File }) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    const video = document.createElement("video");
    video.preload = "metadata";

    const url = URL.createObjectURL(file);
    video.src = url;

    video.addEventListener("loadeddata", () => {
      // Capture at 0.5 seconds as a simple snapshot
      video.currentTime = 0.5;
    });

    video.addEventListener("seeked", () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        setThumbnailUrl(canvas.toDataURL("image/png"));
      }
      URL.revokeObjectURL(url);
    });

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  if (!thumbnailUrl) return null;

  return (
    <img
      src={thumbnailUrl}
      alt="Video thumbnail"
      className="mt-4 rounded shadow-md"
    />
  );
}
