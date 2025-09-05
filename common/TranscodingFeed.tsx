import React from "react";

interface IProps {
  logMessages: string[];
  isTranscoding: boolean;
  error: string | null;
}

function TranscodingFeed({ logMessages, isTranscoding, error }: IProps) {
  return (
    <div className="border border-slate-600 max-h-[240px] p-3 rounded-md bg-slate-900 text-white overflow-y-auto text-xs font-mono space-y-1">
      <div className="flex items-center justify-between mb-2 sticky top-0 bg-slate-900 pb-1 border-b border-slate-700">
        <span className="text-slate-300 font-medium">Logs</span>
      </div>

      {/* FFmpeg Logs */}
      {logMessages.length > 0 ? (
        <div className="space-y-0.5">
          {logMessages.map((msg, index) => (
            <div
              key={index}
              className={`text-xs leading-relaxed ${
                msg.includes("error") || msg.includes("Error")
                  ? "text-red-400"
                  : msg.includes("warning") || msg.includes("Warning")
                  ? "text-yellow-400"
                  : msg.includes("[info]") || msg.includes("frame=")
                  ? "text-blue-300"
                  : "text-gray-300"
              }`}
            >
              {msg}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-slate-500 text-center py-4">
          {isTranscoding
            ? "Waiting for FFmpeg output..."
            : "No logs yet. Start transcoding to see FFmpeg output."}
        </div>
      )}

      {/* Error Messages */}
      {error && (
        <div className="text-red-400 font-bold mt-3 p-2 bg-red-900/20 rounded border border-red-700">
          ❌ {error}
        </div>
      )}
    </div>
  );
}

export default TranscodingFeed;
