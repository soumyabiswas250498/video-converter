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

const inter = Inter({ subsets: ['latin'] });

interface VideoProperties {
  aspectRatio: number;
  width: number; // NEW: Added width
  height: number; // NEW: Added height
}

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoProps, setVideoProps] = useState<VideoProperties | null>(null);
  const [outputSettings, setOutputSettings] = useState<OutputSettings | null>(
    null
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
      // ✅ NOW CAPTURING width and height for downscaling logic
      const width = video.videoWidth;
      const height = video.videoHeight;

      setVideoProps({
        aspectRatio: width / height,
        width: width, // NEW: Store actual dimensions
        height: height, // NEW: Store actual dimensions
      });
      URL.revokeObjectURL(url);
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      setVideoProps(null);
    };

    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

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
              {/* ✅ SHOW input resolution for user reference */}
              {videoProps && (
                <p className="text-xs text-slate-500">
                  Resolution: {videoProps.width}X{videoProps.height}
                </p>
              )}
              <div className="mt-4 rounded-lg overflow-hidden">
                <VideoThumbnail file={selectedFile} />
              </div>
            </div>

            {videoProps && (
              <OutputSettingsMenu
                aspectRatio={videoProps.aspectRatio}
                inputWidth={videoProps.width} // ✅ PASS input width
                inputHeight={videoProps.height} // ✅ PASS input height
                onChange={setOutputSettings}
              />
            )}

            {outputSettings && (
              <Transcoder inputFile={selectedFile} settings={outputSettings} />
            )}
          </div>
        )}
      </div>
    </main>
  );
}
