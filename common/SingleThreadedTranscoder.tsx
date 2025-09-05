"use client";

import { useState, useRef, useEffect } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { OutputSettings } from "./OutputSettingsMenu";
import { Label } from "@/components/ui/label";
import SourceTargetSection from "./SourceTargetSection";
import TranscodingFeed from "./TranscodingFeed";

interface TranscoderProps {
  inputFile: File;
  settings: OutputSettings;
}

export interface VideoAnalysis {
  inputWidth: number;
  inputHeight: number;
  scaleFactor: number;
  duration: number;
  inputFramerate: number;
}

export function SingleThreadedTranscoder({
  inputFile,
  settings,
}: TranscoderProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoAnalysis, setVideoAnalysis] = useState<VideoAnalysis | null>(
    null
  );
  const [ffmpegCommand, setFfmpegCommand] = useState<string>("");
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const ffmpegRef = useRef(new FFmpeg());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const load = async () => {
    const ffmpeg = ffmpegRef.current;
    // --- KEY CHANGE: Use the single-threaded core ---
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

    ffmpeg.on("log", ({ message }) => {
      console.log("[FFmpeg ST Log]:", message);
      setLogMessages((prev) => [...prev, message]);
    });

    ffmpeg.on("progress", ({ progress }) => {
      if (progress >= 0 && progress <= 1) {
        console.log(`[FFmpeg ST Progress]: ${(progress * 100).toFixed(2)}%`);
        setProgress(progress * 100);

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      }
    });

    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.js`,
          "text/javascript"
        ),
        wasmURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.wasm`,
          "application/wasm"
        ),
        // --- KEY CHANGE: workerURL is not needed for single-threaded version ---
      });
      setIsLoaded(true);
      console.log("[FFmpeg] Loaded SINGLE-THREADED core successfully");
    } catch (err) {
      console.error("[FFmpeg ST Load Error]:", err);
      setError("Failed to load FFmpeg (single-threaded)");
    }
  };

  useEffect(() => {
    load();
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const analyzeVideo = async () => {
      if (!inputFile || !settings.resolution) return;
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
          video.onerror = () => reject(new Error("Failed to analyze video"));
        });

        setVideoAnalysis(analysis);

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
        const commandDisplay = `ffmpeg ${args.join(" ")}`;
        setFfmpegCommand(commandDisplay);
      } catch (err) {
        setVideoAnalysis(null);
        setFfmpegCommand("");
      }
    };
    analyzeVideo();
  }, [inputFile, settings]);

  const transcode = async () => {
    if (!isLoaded || isTranscoding || !videoAnalysis) return;

    const [width, height] = settings.resolution.split("x").map(Number);
    if (width > 1920 || height > 1080) {
      setError("Maximum full HD resolution (1920x1080) supported only.");
      return;
    }

    setIsTranscoding(true);
    setProgress(0);
    setOutputUrl(null);
    setError(null);
    setLogMessages([]);

    const ffmpeg = ffmpegRef.current;
    const inputFilename = `input.${inputFile.name.split(".").pop() || "tmp"}`;

    try {
      await ffmpeg.writeFile(inputFilename, await fetchFile(inputFile));

      const processingMultiplier =
        videoAnalysis.scaleFactor > 2.5
          ? 8
          : videoAnalysis.scaleFactor > 1.5
          ? 6
          : 4;
      const baseTimeout = 120000;
      const timeoutDuration = Math.min(
        videoAnalysis.duration * processingMultiplier * 1000 + baseTimeout,
        600000
      );

      const args = [
        "-i",
        inputFilename,
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

      const startTimeout = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          setError("Processing timeout. The video may be too long or complex.");
          setIsTranscoding(false);
        }, timeoutDuration);
      };

      startTimeout();
      await ffmpeg.exec(args);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      const data = await ffmpeg.readFile("output.mp4");
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(data as Uint8Array)], { type: "video/mp4" })
      );
      setOutputUrl(url);
    } catch (err) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setError("Transcoding failed. The file may be corrupted or unsupported.");
    } finally {
      setIsTranscoding(false);
    }
  };

  if (!isLoaded) {
    return (
      <p className="text-center text-slate-500">
        Loading Fallback Transcoder...
      </p>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      {videoAnalysis && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6 shadow-sm">
          <SourceTargetSection
            videoAnalysis={videoAnalysis}
            settings={settings}
          />
          {ffmpegCommand && (
            <div className="bg-slate-900 rounded-lg p-4 mt-4 border border-gray-700">
              <div className="text-green-400 text-xs font-mono break-all whitespace-pre-wrap leading-relaxed">
                {ffmpegCommand}
              </div>
            </div>
          )}
        </div>
      )}
      <Button
        onClick={transcode}
        disabled={isTranscoding || !videoAnalysis}
        className="w-full"
      >
        {isTranscoding
          ? "Transcoding..."
          : "Start Transcoding (Single-Threaded)"}
      </Button>
      {isTranscoding && (
        <div className="space-y-2">
          <Label>Progress</Label>
          <Progress value={progress} />
          <p className="text-center text-sm text-slate-500">
            {Math.round(progress)}%
          </p>
        </div>
      )}
      <TranscodingFeed
        logMessages={logMessages}
        error={error}
        isTranscoding={isTranscoding}
      />
      {outputUrl && (
        <div className="space-y-2">
          <h3 className="font-semibold">Conversion Complete!</h3>
          <video src={outputUrl} controls className="w-full rounded-lg" />
          <a
            href={outputUrl}
            download={`converted-${Date.now()}.mp4`}
            className="inline-block w-full"
          >
            <Button variant="outline" className="w-full">
              Download File
            </Button>
          </a>
        </div>
      )}
    </div>
  );
}
