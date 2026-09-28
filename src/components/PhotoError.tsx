import React from 'react';
import { RotateCcw, Camera } from 'lucide-react';

/**
 * Error after sending a photo to the AI. "Try again" resends the same photo, so a temporary failure
 * (e.g. Google being busy) doesn't mean taking the picture again.
 */
export const PhotoError: React.FC<{ error: string; onRetry?: () => void; onRetake?: () => void; busy?: boolean }> = ({
  error,
  onRetry,
  onRetake,
  busy,
}) => (
  <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold break-words space-y-2">
    <p>{error}</p>
    {(onRetry || onRetake) && (
      <div className="flex gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={busy}
            className="flex-1 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Try again
          </button>
        )}
        {onRetake && (
          <button
            type="button"
            onClick={onRetake}
            disabled={busy}
            className="flex-1 py-2 rounded-lg bg-white border border-rose-300 text-rose-700 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Camera className="w-3.5 h-3.5" /> Take another photo
          </button>
        )}
      </div>
    )}
  </div>
);
