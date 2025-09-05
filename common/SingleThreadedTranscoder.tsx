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

// Interfaces
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

// Helper function to calculate adaptive timeout
const calcTimeoutPerHalfPercent = (
  analysis: VideoAnalysis,
  settings: OutputSettings
): number => {
  const segmentLength = analysis.duration * 0.005;
  const inputPixels = analysis.inputWidth * analysis.inputHeight;
  const [outW, outH] = settings.resolution.split('x').map(Number);
  const outputPixels = outW * outH || 1;
  const scaleRatio = inputPixels / outputPixels;

  const complexityFactor = Math.max(1, scaleRatio);
  const expectedSeconds = segmentLength * complexityFactor;

  const timeoutMs = expectedSeconds * 8 * 1000;
  return Math.max(10000, Math.min(timeoutMs, 120000)); // Clamp between 10s and 90s
};

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
  const [ffmpegCommand, setFfmpegCommand] = useState<string>('');
  const [logMessages, setLogMessages] = useState<string[]>([]);

  const ffmpegRef = useRef(new FFmpeg());

  const load = async () => {
    const ffmpeg = ffmpegRef.current;
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg ST Log]:', message);
      setLogMessages(prev => [...prev, message]);
    });

    ffmpeg.on('progress', ({ progress: progressFloat }) => {
      console.log(progressFloat, isTranscoding, '***p');

      if (progressFloat >= 0 && progressFloat <= 1) {
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
      });
      setIsLoaded(true);
    } catch (err) {
      setError('Failed to load FFmpeg (single-threaded)');
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const analyzeVideo = async () => {
      if (!inputFile || !settings.resolution) return;
      try {
        const video = document.createElement('video');
        const url = URL.createObjectURL(inputFile);
        video.preload = 'metadata';
        video.src = url;

        const analysis = await new Promise<VideoAnalysis>((resolve, reject) => {
          video.onloadedmetadata = () => {
            URL.revokeObjectURL(url);
            resolve({
              inputWidth: video.videoWidth,
              inputHeight: video.videoHeight,
              duration: video.duration,
              inputFramerate: 30,
              scaleFactor: Math.max(
                video.videoWidth / parseInt(settings.resolution.split('x')[0]),
                video.videoHeight / parseInt(settings.resolution.split('x')[1])
              ),
            });
          };
          video.onerror = () => reject(new Error('Failed to analyze video'));
        });
        setVideoAnalysis(analysis);
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
        setFfmpegCommand(`ffmpeg ${args.join(' ')}`);
      } catch (err) {
        setVideoAnalysis(null);
        setFfmpegCommand('');
      }
    };
    analyzeVideo();
  }, [inputFile, settings]);

  const transcode = async () => {
    if (!isLoaded || isTranscoding || !videoAnalysis) return;

    setIsTranscoding(true);
    setProgress(0);
    setOutputUrl(null);
    setError(null);
    setLogMessages([]);

    const ffmpeg = ffmpegRef.current;
    const inputFilename = `input.${inputFile.name.split('.').pop() || 'tmp'}`;

    try {
      await ffmpeg.writeFile(inputFilename, await fetchFile(inputFile));

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

      await ffmpeg.exec(args);

      const data = await ffmpeg.readFile('output.mp4');
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' })
      );
      setOutputUrl(url);
    } catch (err: any) {
      if (err.message && !err.message.includes('Transcoding terminated')) {
        setError(
          'Transcoding failed. The file may be corrupted or unsupported.'
        );
      }
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
          ? 'Transcoding...'
          : 'Start Transcoding (Single-Threaded)'}
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
