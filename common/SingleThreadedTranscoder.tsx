'use client';

import { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

import { Label } from '@/components/ui/label';
import SourceTargetSection from './SourceTargetSection';
import TranscodingFeed from './TranscodingFeed';
import {
  analyzeVideo,
  calcTimeoutPerHalfPercent,
  generateFFmpegCommand,
  OutputSettings,
  VideoAnalysis,
} from '@/lib/videoAnalysis';

// Interfaces
interface TranscoderProps {
  inputFile: File;
  settings: OutputSettings;
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
  const [ffmpegCommand, setFfmpegCommand] = useState<string>('');
  const [logMessages, setLogMessages] = useState<string[]>([]);

  const ffmpegRef = useRef(new FFmpeg());

  const duration = videoAnalysis
    ? calcTimeoutPerHalfPercent(videoAnalysis, settings, false)
    : 60;

  useEffect(() => {
    if (isTranscoding) {
      const timeOut = setTimeout(() => {
        setError(
          'FFmpeg appears stuck. Sorry Your browser or device is not supported.'
        );
        setIsTranscoding(false);
      }, duration);
      return () => {
        clearTimeout(timeOut);
      };
    }
  }, [duration, logMessages.length, isTranscoding]);

  const load = async () => {
    const ffmpeg = ffmpegRef.current;
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg ST Log]:', message);
      setLogMessages(prev => [...prev, message]);
    });

    ffmpeg.on('progress', ({ progress: progressFloat }) => {
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
    const performAnalysis = async () => {
      if (!inputFile || !settings.resolution) return;

      const analysis = await analyzeVideo(inputFile, settings);
      setVideoAnalysis(analysis);

      if (analysis) {
        // Generate FFmpeg command for display
        const commandDisplay = generateFFmpegCommand(inputFile, settings);
        setFfmpegCommand(commandDisplay);
      } else {
        setFfmpegCommand('');
      }
    };

    performAnalysis();
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
        setIsTranscoding(false);
      }
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
