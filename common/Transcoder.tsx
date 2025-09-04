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

export function Transcoder({ inputFile, settings }: TranscoderProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const ffmpegRef = useRef(new FFmpeg());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const load = async () => {
    const ffmpeg = ffmpegRef.current;
    const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/umd';

    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg Log]:', message);
    });

    ffmpeg.on('progress', ({ progress }) => {
      if (progress >= 0 && progress <= 1) {
        console.log(`[FFmpeg Progress]: ${(progress * 100).toFixed(2)}%`);
        setProgress(progress * 100);

        // Reset timeout when progress is made
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

  const analyzeVideo = async () => {
    return new Promise<{
      inputWidth: number;
      inputHeight: number;
      scaleFactor: number;
      duration: number;
    }>(resolve => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(inputFile);
      video.preload = 'metadata';
      video.src = url;

      video.onloadedmetadata = () => {
        const inputWidth = video.videoWidth;
        const inputHeight = video.videoHeight;
        const duration = video.duration;

        const [outputWidth, outputHeight] = settings.resolution
          .split('x')
          .map(Number);
        const scaleFactorX = inputWidth / outputWidth;
        const scaleFactorY = inputHeight / outputHeight;
        const maxScaleFactor = Math.max(scaleFactorX, scaleFactorY);

        const debugMessage = `Input: ${inputWidth}x${inputHeight}, ${Math.round(
          duration
        )}s → Output: ${outputWidth}x${outputHeight} (${maxScaleFactor.toFixed(
          2
        )}x downscale)`;

        console.log(`[Video Analysis] ${debugMessage}`);
        setDebugInfo(debugMessage);
        URL.revokeObjectURL(url);
        resolve({
          inputWidth,
          inputHeight,
          scaleFactor: maxScaleFactor,
          duration,
        });
      };

      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({
          inputWidth: 1920,
          inputHeight: 1080,
          scaleFactor: 1,
          duration: 60,
        });
      };
    });
  };

  const transcode = async () => {
    if (!isLoaded || isTranscoding) return;

    const [widthStr, heightStr] = settings.resolution.split('x');
    const width = parseInt(widthStr, 10);
    const height = parseInt(heightStr, 10);

    if (width > 1920 || height > 1080) {
      setError('Maximum full HD resolution (1920x1080) supported only.');
      return;
    }

    const { scaleFactor, duration } = await analyzeVideo();

    setIsTranscoding(true);
    setProgress(0);
    setOutputUrl(null);
    setError(null);

    console.log('[Transcoder] Starting transcoding...');
    console.log('[Transcoder] Input file:', inputFile.name);
    console.log('[Transcoder] Settings:', settings);

    const ffmpeg = ffmpegRef.current;
    const inputFilename = `input.${inputFile.name.split('.').pop() || 'tmp'}`;

    try {
      await ffmpeg.writeFile(inputFilename, await fetchFile(inputFile));
      console.log('[FFmpeg] Input file written to virtual filesystem');

      // **FIXED: Much more generous timeout based on your test results**
      const processingMultiplier =
        scaleFactor > 2.5 ? 8 : scaleFactor > 1.5 ? 6 : 4;
      const baseTimeout = 120000; // 2 minutes base
      const timeoutDuration = Math.min(
        duration * processingMultiplier * 1000 + baseTimeout,
        600000 // Max 10 minutes
      );

      console.log(
        `[FFmpeg] Setting timeout: ${Math.round(
          timeoutDuration / 1000
        )}s for ${Math.round(duration)}s video`
      );

      // **KEY FIX: Audio copy instead of re-encoding**
      const args = [
        '-i',
        inputFilename,
        // Video: transcode and scale
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast', // Fastest encoding
        '-vf',
        `scale=${settings.resolution.replace('x', ':')}`,
        '-r',
        String(settings.framerate),
        '-b:v',
        `${settings.bitrate}k`,
        // **CRITICAL: Copy audio without re-encoding**
        '-c:a',
        'copy',
        // Only apply mono conversion if specifically requested
        ...(settings.audioMono ? ['-ac', '1'] : []),
        'output.mp4',
      ];

      console.log('[FFmpeg] Command arguments:', args);

      // Set timeout AFTER progress starts
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

      // Start timeout
      startTimeout();

      await ffmpeg.exec(args);

      // Clear timeout on success
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
      {debugInfo && (
        <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs">
          <strong>Video Analysis:</strong> {debugInfo}
        </div>
      )}

      <Button onClick={transcode} disabled={isTranscoding} className="w-full">
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

      <div className="border max-h-24 p-2 rounded-md bg-slate-900 text-white overflow-y-auto text-xs font-mono">
        {error && <div className="text-red-400 font-bold mt-2">{error}</div>}
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
