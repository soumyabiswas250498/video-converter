"use client";

import { useState, useRef, useEffect } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface TranscoderDebugProps {
  inputFile: File | null;
}

interface DebugResult {
  resolution: string;
  status: "pending" | "success" | "failed" | "timeout";
  logs: string[];
  duration?: number;
}

export function TranscoderDebug({ inputFile }: TranscoderDebugProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [debugResults, setDebugResults] = useState<DebugResult[]>([]);
  const ffmpegRef = useRef(new FFmpeg());

  const TEST_RESOLUTIONS = ["1920x1080", "1280x720", "854x480", "640x360"];

  const load = async () => {
    const ffmpeg = ffmpegRef.current;
    const baseURL = "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/umd";
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
        workerURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.worker.js`,
          "text/javascript"
        ),
      });
      setIsLoaded(true);
      console.log("[FFmpeg Debug] Loaded successfully");
    } catch (err) {
      console.error("[FFmpeg Debug Load Error]:", err);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const runDebugTest = async () => {
    if (!isLoaded || !inputFile || isTesting) return;

    setIsTesting(true);
    const initialResults: DebugResult[] = TEST_RESOLUTIONS.map((res) => ({
      resolution: res,
      status: "pending",
      logs: [],
    }));
    setDebugResults(initialResults);

    const ffmpeg = ffmpegRef.current;
    const inputFilename = `debug_input.${
      inputFile.name.split(".").pop() || "mp4"
    }`;
    await ffmpeg.writeFile(inputFilename, await fetchFile(inputFile));

    for (let i = 0; i < TEST_RESOLUTIONS.length; i++) {
      const res = TEST_RESOLUTIONS[i];
      const startTime = performance.now();
      let currentLogs: string[] = [];

      ffmpeg.on("log", ({ message }) => {
        currentLogs.push(message);
        setDebugResults((prev) =>
          prev.map((r) =>
            r.resolution === res ? { ...r, logs: [...currentLogs] } : r
          )
        );
      });

      try {
        const timeoutPromise = new Promise(
          (_, reject) => setTimeout(() => reject(new Error("Timeout")), 45000) // 45-second timeout per test
        );

        const execPromise = ffmpeg.exec([
          "-i",
          inputFilename,
          "-t",
          "30", // Process first 30 seconds
          "-vf",
          `scale=${res.replace("x", ":")}`,
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-an", // No audio for pure video scaling test
          `output_${res}.mp4`,
        ]);

        await Promise.race([execPromise, timeoutPromise]);

        const duration = (performance.now() - startTime) / 1000;
        setDebugResults((prev) =>
          prev.map((r) =>
            r.resolution === res
              ? {
                  ...r,
                  status: "success",
                  duration: parseFloat(duration.toFixed(2)),
                }
              : r
          )
        );
      } catch (err: any) {
        const duration = (performance.now() - startTime) / 1000;
        const status = err.message === "Timeout" ? "timeout" : "failed";
        setDebugResults((prev) =>
          prev.map((r) =>
            r.resolution === res
              ? {
                  ...r,
                  status,
                  logs: [...currentLogs, `ERROR: ${err.message}`],
                  duration: parseFloat(duration.toFixed(2)),
                }
              : r
          )
        );
      }
    }

    setIsTesting(false);
  };

  return (
    <div className="mt-6 border-t pt-6">
      <h3 className="text-lg font-semibold mb-2">Transcoding Debug Tool</h3>
      <p className="text-sm text-slate-500 mb-4">
        This tool tests transcoding the first 30 seconds of your video at
        various resolutions to diagnose environment-specific issues.
      </p>
      <Button
        onClick={runDebugTest}
        disabled={!isLoaded || !inputFile || isTesting}
      >
        {isTesting ? "Running Debug Tests..." : "Run Debug Tests"}
      </Button>

      {isTesting && (
        <Progress
          value={
            (debugResults.filter((r) => r.status !== "pending").length /
              TEST_RESOLUTIONS.length) *
            100
          }
          className="mt-4"
        />
      )}

      <div className="mt-4 space-y-4">
        {debugResults.map((result) => (
          <div key={result.resolution} className="border rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-semibold">{result.resolution}</h4>
              <span
                className={`px-2 py-1 text-xs font-medium rounded-full ${
                  result.status === "success"
                    ? "bg-green-100 text-green-800"
                    : result.status === "failed"
                    ? "bg-red-100 text-red-800"
                    : result.status === "timeout"
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {result.status}
              </span>
            </div>
            {result.duration && (
              <p className="text-xs text-slate-500 mb-2">
                Completed in {result.duration}s
              </p>
            )}
            <div className="bg-slate-900 text-white p-2 rounded-md max-h-60 overflow-y-auto font-mono text-xs">
              {result.logs.length > 0 ? (
                result.logs.map((log, i) => <div key={i}>{log}</div>)
              ) : (
                <p className="text-slate-400">Waiting for logs...</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
