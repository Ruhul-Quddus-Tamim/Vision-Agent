import { useState } from 'react';

interface VideoRecordControlsProps {
  onStartRecording: () => void;
  onStopRecording: () => void;
  isRecording: boolean;
}

export function VideoRecordControls({ 
  onStartRecording, 
  onStopRecording, 
  isRecording 
}: VideoRecordControlsProps) {
  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
      {!isRecording ? (
        <button
          onClick={onStartRecording}
          className="bg-red-600 text-white px-4 py-2 rounded-full hover:bg-red-700"
        >
          Start Recording
        </button>
      ) : (
        <button
          onClick={onStopRecording}
          className="bg-gray-600 text-white px-4 py-2 rounded-full hover:bg-gray-700"
        >
          Stop Recording
        </button>
      )}
    </div>
  );
}
