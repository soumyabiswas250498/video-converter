'use client';

import { useState, useEffect } from 'react';
import { Inter } from 'next/font/google';
import FileInput from '@/common/FileInput';
import { VideoThumbnail } from '@/common/VideoThumbnail';
import {
  OutputSettingsMenu,
  OutputSettings,
} from '@/common/OutputSettingsMenu';
import { Transcoder } from '@/common/Transcoder';
import { SingleThreadedTranscoder } from '@/common/SingleThreadedTranscoder';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

const inter = Inter({ subsets: ['latin'] });

interface VideoProperties {
  aspectRatio: number;
  width: number;
  height: number;
}

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoProps, setVideoProps] = useState<VideoProperties | null>(null);
  const [outputSettings, setOutputSettings] = useState<OutputSettings | null>(
    null
  );
  const [transcoderMode, setTranscoderMode] = useState<'multi' | 'single'>(
    'multi'
  );

  useEffect(() => {
    if (!selectedFile) {
      setVideoProps(null);
      return;
    }

    const video = document.createElement('video');
    const url = URL.createObjectURL(selectedFile);
    video.preload = 'metadata';
    video.src = url;

    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      setVideoProps({
        aspectRatio: width / height,
        width: width,
        height: height,
      });
      URL.revokeObjectURL(url);
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      setVideoProps(null);
    };

    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [selectedFile]);

  // Automatically switch to single-threaded if SharedArrayBuffer is not supported
  useEffect(() => {
    if (typeof SharedArrayBuffer === 'undefined') {
      console.warn(
        'SharedArrayBuffer not supported, defaulting to single-threaded mode.'
      );
      setTranscoderMode('single');
    }
  }, []);

  return (
    <main
      className={`flex min-h-screen flex-col items-center p-8 ${inter.className}`}
    >
      <div className="w-full max-w-xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">Video Transcoder</h1>
          <p className="text-slate-500 mb-8">
            Convert video files directly in your browser.
          </p>
        </div>

        <FileInput onFileSelected={setSelectedFile} />

        {selectedFile && (
          <div className="mt-6 space-y-4">
            <div className="p-4 border rounded-lg bg-slate-50">
              <p className="font-medium text-sm truncate">
                {selectedFile.name}
              </p>
              <p className="text-xs text-slate-500">
                Size: {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
              {videoProps && (
                <p className="text-xs text-slate-500">
                  Resolution: {videoProps.width}×{videoProps.height}
                </p>
              )}
              <div className="mt-4 rounded-lg overflow-hidden">
                <VideoThumbnail file={selectedFile} />
              </div>
            </div>

            {/* --- Transcoder Mode Toggle --- */}
            <div className="p-4 border rounded-lg bg-slate-50">
              <Label className="font-semibold">Transcoder Mode</Label>
              <RadioGroup
                value={transcoderMode}
                onValueChange={(value: 'multi' | 'single') =>
                  setTranscoderMode(value)
                }
                className="mt-2 grid grid-cols-2 gap-4"
              >
                <div>
                  <RadioGroupItem
                    value="multi"
                    id="multi-threaded"
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor="multi-threaded"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                  >
                    🚀 Multi-threaded
                    <span className="text-xs text-slate-500 mt-1">
                      Faster, requires modern browser
                    </span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem
                    value="single"
                    id="single-threaded"
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor="single-threaded"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                  >
                    🐢 Single-threaded
                    <span className="text-xs text-slate-500 mt-1">
                      More compatible, stable
                    </span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {videoProps && (
              <OutputSettingsMenu
                aspectRatio={videoProps.aspectRatio}
                inputWidth={videoProps.width}
                inputHeight={videoProps.height}
                onChange={setOutputSettings}
              />
            )}

            {/* --- Conditional Rendering of Transcoder --- */}
            {outputSettings && (
              <>
                {transcoderMode === 'multi' ? (
                  <Transcoder
                    inputFile={selectedFile}
                    settings={outputSettings}
                  />
                ) : (
                  <SingleThreadedTranscoder
                    inputFile={selectedFile}
                    settings={outputSettings}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
