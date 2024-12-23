import { useEffect, useState } from "react";

export function LiveCameraFeed() {
  const [frame, setFrame] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingWs, setRecordingWs] = useState<WebSocket | null>(null);
  const [duration, setDuration] = useState(0);
  const [recordingInterval, setRecordingInterval] = useState<NodeJS.Timeout | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<string>("");
  const [cameraConfig, setCameraConfig] = useState({
    username: "",
    password: "",
    ip: "",
    channel: "",
    subtype: ""
  });
  const [isConnected, setIsConnected] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    return () => {
      if (recordingInterval) clearInterval(recordingInterval);
    };
  }, [recordingInterval]);

  useEffect(() => {
    return () => {
      if (ws && !isConnected) {
        ws.close();
      }
    };
  }, [ws, isConnected]);

  const connectToCamera = async () => {
    if (!Object.values(cameraConfig).every(value => value)) {
      console.error("All camera configuration fields are required");
      return;
    }

    try {
      const response = await fetch("http://localhost:8000/set-camera-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(cameraConfig),
      });

      if (!response.ok) {
        throw new Error("Failed to set camera configuration");
      }

      const newWs = new WebSocket("ws://localhost:8000/camera-feed");

      newWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.error) {
            console.error("Camera error:", data.error);
            setIsConnected(false);
            return;
          }
        } catch {
          setFrame(`data:image/jpeg;base64,${event.data}`);
        }
      };

      newWs.onopen = () => {
        setIsConnected(true);
        setWs(newWs);
      };

      newWs.onerror = (error) => {
        console.error("WebSocket error:", error);
        setIsConnected(false);
      };

      newWs.onclose = () => {
        console.log("Camera WebSocket closed");
        setIsConnected(false);
        setWs(null);
      };
    } catch (error) {
      console.error("Error connecting to camera:", error);
      setIsConnected(false);
    }
  };

  const startRecording = () => {
    const recordingSocket = new WebSocket("ws://localhost:8000/start-recording");

    recordingSocket.onopen = () => {
      setIsRecording(true);
      setDuration(0);
      setRecordingStatus("Recording started");

      const interval = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
      setRecordingInterval(interval);
    };

    recordingSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) {
          console.error("Recording error:", data.error);
          stopRecording();
        }
      } catch (e) {
        console.error("Error parsing message:", e);
      }
    };

    recordingSocket.onclose = () => {
      console.log("Recording WebSocket closed");
    };

    setRecordingWs(recordingSocket);
  };

  const stopRecording = async () => {
    if (recordingInterval) {
      clearInterval(recordingInterval);
      setRecordingInterval(null);
    }

    if (recordingWs) {
      recordingWs.close();
      setRecordingWs(null);
    }

    try {
      const response = await fetch("http://localhost:8000/stop-recording", {
        method: "POST",
      });
      const data = await response.json();
      setRecordingStatus("Recording saved");
      setTimeout(() => setRecordingStatus(""), 3000);
    } catch (error) {
      console.error("Error stopping recording:", error);
      setRecordingStatus("Error saving recording");
    } finally {
      setIsRecording(false);
      setDuration(0);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative w-full h-full bg-black flex flex-col justify-center items-center">
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 bg-white/10 p-4 rounded-2xl backdrop-blur">
        <div className="grid grid-cols-1 gap-2 w-56">
          <input
            type="text"
            value={cameraConfig.username}
            onChange={(e) => setCameraConfig(prev => ({ ...prev, username: e.target.value }))}
            placeholder="Username"
            className="px-3 py-1.5 text-sm rounded-full border text-black w-full bg-white/90 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isConnected}
          />
          <input
            type="password"
            value={cameraConfig.password}
            onChange={(e) => setCameraConfig(prev => ({ ...prev, password: e.target.value }))}
            placeholder="Password"
            className="px-3 py-1.5 text-sm rounded-full border text-black w-full bg-white/90 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isConnected}
          />
          <input
            type="text"
            value={cameraConfig.ip}
            onChange={(e) => setCameraConfig(prev => ({ ...prev, ip: e.target.value }))}
            placeholder="IP Address"
            className="px-3 py-1.5 text-sm rounded-full border text-black w-full bg-white/90 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isConnected}
          />
          <input
            type="text"
            value={cameraConfig.channel}
            onChange={(e) => setCameraConfig(prev => ({ ...prev, channel: e.target.value }))}
            placeholder="Channel"
            className="px-3 py-1.5 text-sm rounded-full border text-black w-full bg-white/90 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isConnected}
          />
          <input
            type="text"
            value={cameraConfig.subtype}
            onChange={(e) => setCameraConfig(prev => ({ ...prev, subtype: e.target.value }))}
            placeholder="Subtype"
            className="px-3 py-1.5 text-sm rounded-full border text-black w-full bg-white/90 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isConnected}
          />
          <button
            onClick={isConnected ? () => ws?.close() : connectToCamera}
            className={`px-4 py-1.5 rounded-full text-sm ${
              isConnected ? "bg-red-600" : "bg-blue-600"
            } text-white w-full hover:opacity-90 transition-opacity`}
          >
            {isConnected ? "Disconnect" : "Connect"}
          </button>
        </div>
      </div>

      <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-2">
        <div className="flex items-center gap-4 text-white">
          <span className={`px-2 py-1 rounded ${isConnected ? "bg-green-600" : "bg-red-600"
            }`}>
            {isConnected ? "Connected" : "Disconnected"}
          </span>
          {isRecording && (
            <span className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-600 animate-pulse"></div>
              REC {formatDuration(duration)}
            </span>
          )}
        </div>
        {recordingStatus && (
          <span className="text-sm text-white bg-black/50 px-2 py-1 rounded">
            {recordingStatus}
          </span>
        )}
      </div>

      <div className="w-full h-full flex justify-center items-center">
        {frame ? (
          <img
            src={frame}
            alt="Live Camera Feed"
            className="max-w-full max-h-full object-contain"
            style={{ width: '960px', height: '540px' }}
          />
        ) : (
          <p className="text-white">Connect to your own camera</p>
        )}
      </div>

      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
        {!isRecording ? (
          <button
            onClick={startRecording}
            className={`px-4 py-2 rounded-full ${isConnected
              ? "bg-red-600 hover:bg-red-700"
              : "bg-gray-400 cursor-not-allowed"
              } text-white transition-colors duration-200`}
            disabled={!isConnected}
          >
            Start Recording
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="bg-gray-600 text-white px-4 py-2 rounded-full hover:bg-gray-700 transition-colors duration-200"
          >
            Stop Recording
          </button>
        )}
      </div>
    </div>
  );
}
