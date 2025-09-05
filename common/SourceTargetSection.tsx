import React from 'react';
import { VideoAnalysis } from './Transcoder';
import { OutputSettings } from './OutputSettingsMenu';

interface IProps {
  videoAnalysis: VideoAnalysis;
  settings: OutputSettings;
}

function SourceTargetSection({ videoAnalysis, settings }: IProps) {
  return (
    <>
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
                {videoAnalysis.inputWidth}X{videoAnalysis.inputHeight}
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
    </>
  );
}

export default SourceTargetSection;
