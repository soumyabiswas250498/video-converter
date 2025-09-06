export interface VideoAnalysis {
  inputWidth: number;
  inputHeight: number;
  scaleFactor: number;
  duration: number;
  inputFramerate: number;
}

export interface OutputSettings {
  resolution: string;
  framerate: number;
  bitrate: number;
  audioMono?: boolean;
}

/**
 * Analyzes a video file to extract metadata and calculate scaling factors
 * @param inputFile - The video file to analyze
 * @param settings - Output settings containing resolution information
 * @returns Promise<VideoAnalysis | null> - Video analysis data or null if analysis fails
 */
export async function analyzeVideo(
  inputFile: File,
  settings: OutputSettings,
): Promise<VideoAnalysis | null> {
  if (!inputFile || !settings.resolution) return null;

  console.log("[Video Analysis] Analyzing file and settings...");

  try {
    const video = document.createElement("video");
    const url = URL.createObjectURL(inputFile);
    video.preload = "metadata";
    video.src = url;

    const analysis = await new Promise<VideoAnalysis>((resolve, reject) => {
      video.onloadedmetadata = () => {
        const inputWidth = video.videoWidth;
        const inputHeight = video.videoHeight;
        const duration = video.duration;
        const inputFramerate = 30; // Default fallback

        const [outputWidth, outputHeight] = settings.resolution
          .split("x")
          .map(Number);

        const scaleFactorX = inputWidth / outputWidth;
        const scaleFactorY = inputHeight / outputHeight;
        const maxScaleFactor = Math.max(scaleFactorX, scaleFactorY);

        URL.revokeObjectURL(url);

        resolve({
          inputWidth,
          inputHeight,
          scaleFactor: maxScaleFactor,
          duration,
          inputFramerate,
        });
      };

      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to analyze video"));
      };
    });

    console.log("[Video Analysis] Complete:", analysis);
    return analysis;
  } catch (err) {
    console.error("[Video Analysis Error]:", err);
    return null;
  }
}

/**
 * Generates FFmpeg command string for display purposes
 * @param inputFile - The input video file
 * @param settings - Output settings
 * @returns string - FFmpeg command string
 */
export function generateFFmpegCommand(
  inputFile: File,
  settings: OutputSettings,
): string {
  const args = [
    "-i",
    `input.${inputFile.name.split(".").pop() || "mp4"}`,
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-vf",
    `scale=${settings.resolution.replace("x", ":")}`,
    "-r",
    String(settings.framerate),
    "-b:v",
    `${settings.bitrate}k`,
    "-c:a",
    "copy",
    ...(settings.audioMono ? ["-ac", "1"] : []),
    "output.mp4",
  ];

  return `ffmpeg ${args.join(" ")}`;
}

/**
 * Calculates timeout duration based on video analysis and settings
 * @param analysis - Video analysis data
 * @param settings - Output settings
 * @returns number - Timeout in milliseconds
 */
export function calcTimeoutPerHalfPercent(
  analysis: VideoAnalysis,
  settings: OutputSettings,
  isSingleThread: boolean,
): number {
  const segmentLength = analysis.duration * 0.005; // in seconds
  const inputPixels = analysis.inputWidth * analysis.inputHeight;
  const [outW, outH] = settings.resolution.split("x").map(Number);
  const outputPixels = outW * outH;
  const scaleFactor = outputPixels / inputPixels;

  // expected time proportional to segmentLength × scaleFactor
  const expectedSeconds = segmentLength * Math.max(1, scaleFactor);
  return isSingleThread ? expectedSeconds * 8 * 1000 : expectedSeconds * 4 * 1000;
}

