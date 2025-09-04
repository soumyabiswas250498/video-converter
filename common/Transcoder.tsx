'use client';

import { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { OutputSettings } from './OutputSettingsMenu';
import { Label } from '@/components/ui/label';

interface TranscoderProps {
  inputFile: File;
  settings: OutputSettings;
}

interface VideoAnalysis {
  inputWidth: number;
  inputHeight: number;
  scaleFactor: number;
  duration: number;
  inputFramerate: number;
}

export function Transcoder({ inputFile, settings }: TranscoderProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoAnalysis, setVideoAnalysis] = useState<VideoAnalysis | null>(
    null
  );
  const [ffmpegCommand, setFfmpegCommand] = useState<string>('');
  const [logMessages, setLogMessages] = useState<string[]>([]); // ✅ NEW: Store FFmpeg logs
  const ffmpegRef = useRef(new FFmpeg());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const load = async () => {
    const ffmpeg = ffmpegRef.current;
    const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/umd';

    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg Log]:', message);
      // ✅ NEW: Store logs for display (keep last 50 messages for performance)
      setLogMessages(prev => [...prev, message]);
    });

    ffmpeg.on('progress', ({ progress }) => {
      if (progress >= 0 && progress <= 1) {
        console.log(`[FFmpeg Progress]: ${(progress * 100).toFixed(2)}%`);
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
          'text/javascript'
        ),
        wasmURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.wasm`,
          'application/wasm'
        ),
        workerURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.worker.js`,
          'text/javascript'
        ),
      });
      setIsLoaded(true);
      console.log('[FFmpeg] Loaded successfully');
    } catch (err) {
      console.error('[FFmpeg Load Error]:', err);
      setError('Failed to load FFmpeg');
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

  // ✅ Analyze video whenever file or settings change
  useEffect(() => {
    const analyzeVideo = async () => {
      if (!inputFile || !settings.resolution) return;

      console.log('[Video Analysis] Analyzing file and settings...');

      try {
        const video = document.createElement('video');
        const url = URL.createObjectURL(inputFile);
        video.preload = 'metadata';
        video.src = url;

        const analysis = await new Promise<VideoAnalysis>((resolve, reject) => {
          video.onloadedmetadata = () => {
            const inputWidth = video.videoWidth;
            const inputHeight = video.videoHeight;
            const duration = video.duration;
            const inputFramerate = 30; // Default fallback

            const [outputWidth, outputHeight] = settings.resolution
              .split('x')
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
            reject(new Error('Failed to analyze video'));
          };
        });

        setVideoAnalysis(analysis);

        // ✅ Pre-generate FFmpeg command for display
        const args = [
          '-i',
          `input.${inputFile.name.split('.').pop() || 'mp4'}`,
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-vf',
          `scale=${settings.resolution.replace('x', ':')}`,
          '-r',
          String(settings.framerate),
          '-b:v',
          `${settings.bitrate}k`,
          '-c:a',
          'copy',
          ...(settings.audioMono ? ['-ac', '1'] : []),
          'output.mp4',
        ];
        const commandDisplay = `ffmpeg ${args.join(' ')}`;
        setFfmpegCommand(commandDisplay);

        console.log('[Video Analysis] Complete:', analysis);
      } catch (err) {
        console.error('[Video Analysis Error]:', err);
        setVideoAnalysis(null);
        setFfmpegCommand('');
      }
    };

    analyzeVideo();
  }, [inputFile, settings]);

  const transcode = async () => {
    if (!isLoaded || isTranscoding || !videoAnalysis) return;

    const [widthStr, heightStr] = settings.resolution.split('x');
    const width = parseInt(widthStr, 10);
    const height = parseInt(heightStr, 10);

    if (width > 1920 || height > 1080) {
      setError('Maximum full HD resolution (1920x1080) supported only.');
      return;
    }

    setIsTranscoding(true);
    setProgress(0);
    setOutputUrl(null);
    setError(null);
    setLogMessages([]); // ✅ NEW: Clear logs when starting new transcoding

    console.log('[Transcoder] Starting transcoding...');
    console.log('[Transcoder] Input file:', inputFile.name);
    console.log('[Transcoder] Settings:', settings);

    const ffmpeg = ffmpegRef.current;
    const inputFilename = `input.${inputFile.name.split('.').pop() || 'tmp'}`;

    try {
      await ffmpeg.writeFile(inputFilename, await fetchFile(inputFile));
      console.log('[FFmpeg] Input file written to virtual filesystem');

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

      console.log(
        `[FFmpeg] Setting timeout: ${Math.round(
          timeoutDuration / 1000
        )}s for ${Math.round(videoAnalysis.duration)}s video`
      );

      const args = [
        '-i',
        inputFilename,
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-vf',
        `scale=${settings.resolution.replace('x', ':')}`,
        '-r',
        String(settings.framerate),
        '-b:v',
        `${settings.bitrate}k`,
        '-c:a',
        'copy',
        ...(settings.audioMono ? ['-ac', '1'] : []),
        'output.mp4',
      ];

      console.log('[FFmpeg] Command arguments:', args);

      const startTimeout = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          console.log(
            `[FFmpeg] Timeout after ${Math.round(timeoutDuration / 1000)}s`
          );
          setError(
            `Processing timeout. Try a shorter video or lower quality settings.`
          );
          setIsTranscoding(false);
        }, timeoutDuration);
      };

      startTimeout();
      await ffmpeg.exec(args);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      console.log('[FFmpeg] Transcoding completed successfully');

      const data = await ffmpeg.readFile('output.mp4');
      console.log('[FFmpeg] Output file size:', data.length, 'bytes');

      const url = URL.createObjectURL(
        new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' })
      );
      setOutputUrl(url);
    } catch (err) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      console.error('[FFmpeg Error]:', err);
      setError(
        'Transcoding failed. Try reducing video length or quality settings.'
      );
    } finally {
      setIsTranscoding(false);
    }
  };

  if (!isLoaded)
    return (
      <p className="text-center text-slate-500">Loading transcoder engine...</p>
    );

  return (
    <div className="mt-8 space-y-4">
      {/* Video Analysis Preview */}
      {videoAnalysis && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <h3 className="font-semibold text-gray-800">Transcoding Preview</h3>
          </div>

          {/* Main Info Grid */}
          <div className="grid md:grid-cols-2 gap-8 mb-4">
            {/* Input Section */}
            <div className="bg-white/60 rounded-lg p-4 border border-green-100">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">📹</span>
                <span className="font-medium text-green-700">Source</span>
              </div>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>Resolution:</span>
                  <span className="font-medium text-gray-800">
                    {videoAnalysis.inputWidth}×{videoAnalysis.inputHeight}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Duration:</span>
                  <span className="font-medium text-gray-800">
                    {Math.round(videoAnalysis.duration)}s
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>FPS:</span>
                  <span className="font-medium text-gray-800">
                    {videoAnalysis.inputFramerate}
                  </span>
                </div>
              </div>
            </div>

            {/* Output Section */}
            <div className="bg-white/60 rounded-lg p-4 border border-blue-100">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🎯</span>
                <span className="font-medium text-blue-700">Target</span>
              </div>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>Resolution:</span>
                  <span className="font-medium text-gray-800">
                    {settings.resolution}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Bitrate:</span>
                  <span className="font-medium text-gray-800">
                    {settings.bitrate}k
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>FPS:</span>
                  <span className="font-medium text-gray-800">
                    {settings.framerate}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Scale:</span>
                  <span className="font-medium text-gray-800">
                    {videoAnalysis.scaleFactor.toFixed(2)}x
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Predicted File Size */}
          <div className="bg-white/60 rounded-lg p-4 border border-purple-100 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">💾</span>
                <span className="font-medium text-purple-700">
                  Estimated Output Size
                </span>
              </div>
              <span className="text-lg font-bold text-purple-800">
                ~
                {(() => {
                  // Predict file size: duration (s) × bitrate (kbps) × 125 bytes/s ÷ 1MB
                  const sizeMB =
                    (videoAnalysis.duration * settings.bitrate * 125) /
                    (1024 * 1024);
                  return sizeMB < 1
                    ? `${Math.round(sizeMB * 1024)}KB`
                    : `${sizeMB.toFixed(1)}MB`;
                })()}
              </span>
            </div>
          </div>

          {/* FFmpeg Command */}
          {ffmpegCommand && (
            <div className="bg-slate-900 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">⚙️</span>
                <span className="font-medium text-gray-300 text-sm">
                  Command
                </span>
              </div>
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
        {isTranscoding ? 'Transcoding...' : 'Start Transcoding'}
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

      {/* ✅ UPDATED: FFmpeg Logs Display with 240px max height and scrolling */}
      <div className="border border-slate-600 max-h-[240px] p-3 rounded-md bg-slate-900 text-white overflow-y-auto text-xs font-mono space-y-1">
        <div className="flex items-center justify-between mb-2 sticky top-0 bg-slate-900 pb-1 border-b border-slate-700">
          <span className="text-slate-300 font-medium">Logs</span>
          {logMessages.length > 0 && (
            <button
              onClick={() => setLogMessages([])}
              className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-slate-700 transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* FFmpeg Logs */}
        {logMessages.length > 0 ? (
          <div className="space-y-0.5">
            {logMessages.map((msg, index) => (
              <div
                key={index}
                className={`text-xs leading-relaxed ${
                  msg.includes('error') || msg.includes('Error')
                    ? 'text-red-400'
                    : msg.includes('warning') || msg.includes('Warning')
                    ? 'text-yellow-400'
                    : msg.includes('[info]') || msg.includes('frame=')
                    ? 'text-blue-300'
                    : 'text-gray-300'
                }`}
              >
                {msg}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-slate-500 text-center py-4">
            {isTranscoding
              ? 'Waiting for FFmpeg output...'
              : 'No logs yet. Start transcoding to see FFmpeg output.'}
          </div>
        )}

        {/* Error Messages */}
        {error && (
          <div className="text-red-400 font-bold mt-3 p-2 bg-red-900/20 rounded border border-red-700">
            ❌ {error}
          </div>
        )}
      </div>

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
