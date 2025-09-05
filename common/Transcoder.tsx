'use client';

import { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { OutputSettings } from './OutputSettingsMenu';
import { Label } from '@/components/ui/label';
import SourceTargetSection from './SourceTargetSection';
import TranscodingFeed from './TranscodingFeed';

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

function calcTimeoutPerHalfPercent(
  analysis: VideoAnalysis,
  settings: OutputSettings
) {
  const segmentLength = analysis.duration * 0.005; // in seconds

  const inputPixels = analysis.inputWidth * analysis.inputHeight;
  const [outW, outH] = settings.resolution.split('x').map(Number);
  const outputPixels = outW * outH;
  const scaleFactor = outputPixels / inputPixels;

  // expected time proportional to segmentLength × scaleFactor
  const expectedSeconds = segmentLength * Math.max(1, scaleFactor);

  return expectedSeconds * 4 * 1000; // apply 4x tolerance, convert ms
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

  const duration = videoAnalysis
    ? calcTimeoutPerHalfPercent(videoAnalysis, settings)
    : 60;

  useEffect(() => {
    if (isTranscoding) {
      const timeOut = setTimeout(() => {
        setError('FFmpeg appears stuck. Try with single thread transcoding.');
        setIsTranscoding(false);
      }, duration);

      return () => {
        clearTimeout(timeOut);
      };
    }
  }, [duration, logMessages.length, isTranscoding]);

  const load = async () => {
    const ffmpeg = ffmpegRef.current;
    const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/umd';

    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg Log]:', message);
      setLogMessages(prev => [...prev, message]);
    });

    ffmpeg.on('progress', ({ progress: progressFloat }) => {
      if (progressFloat >= 0 && progressFloat <= 1) {
        console.log(`[FFmpeg Progress]: ${(progressFloat * 100).toFixed(2)}%`);
        setProgress(progressFloat * 100);
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
    setLogMessages([]);

    console.log('[Transcoder] Starting transcoding...');
    console.log('[Transcoder] Input file:', inputFile.name);
    console.log('[Transcoder] Settings:', settings);

    const ffmpeg = ffmpegRef.current;
    const inputFilename = `input.${inputFile.name.split('.').pop() || 'tmp'}`;

    try {
      await ffmpeg.writeFile(inputFilename, await fetchFile(inputFile));
      console.log('[FFmpeg] Input file written to virtual filesystem');

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

      await ffmpeg.exec(args);

      console.log('[FFmpeg] Transcoding completed successfully');

      const data = await ffmpeg.readFile('output.mp4');
      console.log('[FFmpeg] Output file size:', data.length, 'bytes');

      const url = URL.createObjectURL(
        new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' })
      );
      setOutputUrl(url);
    } catch (err) {
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
          <SourceTargetSection
            videoAnalysis={videoAnalysis}
            settings={settings}
          />

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
