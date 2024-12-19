import { useEffect, useState } from "react";

export function LiveCameraFeed() {
  const [frame, setFrame] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingWs, setRecordingWs] = useState<WebSocket | null>(null);
  const [duration, setDuration] = useState(0);
  const [recordingInterval, setRecordingInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/camera-feed");

    ws.onmessage = (event) => {
      setFrame(`data:image/jpeg;base64,${event.data}`);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return () => {
      ws.close();
      if (recordingInterval) clearInterval(recordingInterval);
    };
  }, []);

  const startRecording = () => {
    const ws = new WebSocket("ws://localhost:8000/start-recording");
    setRecordingWs(ws);
    setIsRecording(true);
    setDuration(0);
    
    // Start duration timer
    const interval = setInterval(() => {
      setDuration(prev => prev + 1);
    }, 1000);
    setRecordingInterval(interval);
  };

  const stopRecording = () => {
    if (recordingWs) {
      recordingWs.close();
      setRecordingWs(null);
      setIsRecording(false);
      
      // Clear duration timer
      if (recordingInterval) {
        clearInterval(recordingInterval);
        setRecordingInterval(null);
      }
      
      fetch("http://localhost:8000/stop-recording", {
        method: "POST",
      })
        .then((response) => response.json())
        .then((data) => {
          console.log("Recording saved:", data);
        })
        .catch((error) => {
          console.error("Error stopping recording:", error);
        });
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative w-full h-full bg-black flex justify-center items-center">
      {/* Status and Duration */}
      <div className="absolute top-4 left-4 text-white z-20 flex gap-4">
        <span>{frame ? "Stream connected" : "Connecting..."}</span>
        {isRecording && (
          <span className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-600 animate-pulse"></div>
            REC {formatDuration(duration)}
          </span>
        )}
      </div>

      {/* Camera Feed */}
      <div className="w-full h-full flex justify-center items-center">
        {frame ? (
          <img
            src={frame}
            alt="Live Camera Feed"
            className="max-w-full max-h-full object-contain"
            style={{ width: '960px', height: '540px' }} // 16:9 aspect ratio
          />
        ) : (
          <p className="text-white">Connecting to camera feed...</p>
        )}
      </div>

      {/* Recording Controls */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
        {!isRecording ? (
          <button
            onClick={startRecording}
            className="bg-red-600 text-white px-4 py-2 rounded-full hover:bg-red-700"
          >
            Start Recording
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="bg-gray-600 text-white px-4 py-2 rounded-full hover:bg-gray-700"
          >
            Stop Recording
          </button>
        )}
      </div>
    </div>
  );
}
