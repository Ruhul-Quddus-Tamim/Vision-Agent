import os
os.environ["ANTHROPIC_API_KEY"] = "API_KEY"
os.environ["OPENAI_API_KEY"] = "API_KEY"

import asyncio
import os
import cv2
import base64
from typing import Any, Dict, List, Optional

import httpx
from fastapi import (
    BackgroundTasks,
    FastAPI,
    WebSocket,
    WebSocketDisconnect,
    UploadFile,
    File,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from vision_agent.agent import VisionAgentV2
from vision_agent.agent.types import AgentMessage
from vision_agent.utils.execute import CodeInterpreterFactory

import time
from datetime import datetime
import subprocess
import signal

# Initialize FastAPI app
app = FastAPI()
DEBUG_HIL = False

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Your frontend address
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded media files
app.mount("/uploaded_media", StaticFiles(directory="uploaded_media"), name="uploaded_media")

# WebSocket clients
clients: List[WebSocket] = []
camera_clients: List[WebSocket] = []  # Clients subscribed to camera feed

# Add these new variables at the top with other global variables
recording = False
video_writer = None

# Helper: Async message update
async def _async_update_callback(message: Dict[str, Any]):
    async with httpx.AsyncClient() as client:
        await client.post("http://localhost:8000/send_message", json=message)

# Helper: Sync wrapper for async message update
def update_callback(message: Dict[str, Any]):
    # Create a new event loop and run the async function
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(_async_update_callback(message))
    loop.close()

# Initialize Vision Agent
if DEBUG_HIL:
    agent = VisionAgentV2(
        verbose=True,
        update_callback=update_callback,
        hil=True,
    )
    code_interpreter = CodeInterpreterFactory.new_instance(non_exiting=True)
else:
    agent = VisionAgentV2(
        verbose=True,
        update_callback=update_callback,
    )
    code_interpreter = CodeInterpreterFactory.new_instance()

# Pydantic models
class Media(BaseModel):
    filePath: str  # Local file path for backend processing
    fileUrl: str   # URL for frontend display

class Message(BaseModel):
    role: str
    content: str
    media: Optional[List[Media]] = None

# Message processing in background
def process_messages_background(messages: List[Dict[str, Any]]):
    for message in messages:
        if "media" in message and message["media"] is None:
            del message["media"]
        elif "media" in message and message["media"]:
            # Use local file paths for processing
            message["media"] = [media_item["filePath"] for media_item in message["media"]]

    # Pass the messages to the agent
    agent.chat(
        [
            AgentMessage(
                role=message["role"],
                content=message["content"],
                media=message.get("media", None),
            )
            for message in messages
        ],
        code_interpreter=code_interpreter,
    )

# Chat endpoint
@app.post("/chat")
async def chat(
    messages: List[Message], background_tasks: BackgroundTasks
) -> Dict[str, Any]:
    background_tasks.add_task(
        process_messages_background, [elt.dict() for elt in messages]
    )
    return {
        "status": "Processing started",
        "message": "Your messages are being processed in the background",
    }

# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    clients.append(websocket)
    try:
        while True:
            await websocket.receive_json()
    except WebSocketDisconnect:
        clients.remove(websocket)
        print("Client disconnected")

# Send message endpoint
@app.post("/send_message")
async def send_message(message: Dict[str, Any]):
    for client in clients:
        await client.send_json(message)

@app.websocket("/camera-feed")
async def camera_feed(websocket: WebSocket):
    """
    WebSocket endpoint for streaming camera frames.
    """
    await websocket.accept()
    camera_clients.append(websocket)
    print("Camera client connected.")

    # Start streaming video
    cap = cv2.VideoCapture("rtsp://admin:PASSWORD@CAMERA_IP_ADDRESS:554/cam/realmonitor?channel=4&subtype=0")

    if not cap.isOpened():
        await websocket.send_json({"error": "Unable to open camera stream"})
        return

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # If recording is active, write the frame
            if recording and video_writer:
                video_writer.write(frame)

            _, buffer = cv2.imencode(".jpg", frame)
            frame_base64 = base64.b64encode(buffer).decode("utf-8")

            await websocket.send_text(frame_base64)
            await asyncio.sleep(0.03)  # Limit the frame rate

    except WebSocketDisconnect:
        print("Camera client disconnected.")
    finally:
        camera_clients.remove(websocket)
        cap.release()

# Add these new endpoints
@app.websocket("/start-recording")
async def start_recording(websocket: WebSocket):
    global recording, video_writer
    await websocket.accept()
    
    # Create output directory if it doesn't exist
    os.makedirs("recordings", exist_ok=True)
    
    # Generate filename with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = f"recordings/recording_{timestamp}.mp4"
    
    # Start FFmpeg process
    ffmpeg_cmd = [
        'ffmpeg',
        '-y',  # Overwrite output file if it exists
        '-f', 'rtsp',
        '-rtsp_transport', 'tcp',
        '-i', 'rtsp://admin:PASSWORD@CAMERA_IP_ADDRESS:554/cam/realmonitor?channel=4&subtype=0',
        '-c:v', 'libx264',  # Use H.264 codec
        '-preset', 'ultrafast',  # Faster encoding
        '-crf', '23',  # Quality (lower is better, 18-28 is good)
        '-vf', 'scale=1200:720',  # Scale to 720p
        '-r', '30',  # 30 FPS
        '-async', '1',  # Audio sync
        output_path
    ]
    
    try:
        # Start FFmpeg process
        process = subprocess.Popen(
            ffmpeg_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        print(f"Started recording to {output_path}")
        recording = True
        
        while recording:
            if process.poll() is not None:
                print("FFmpeg process ended unexpectedly")
                break
            await asyncio.sleep(0.1)
            
        # Gracefully stop FFmpeg
        if process.poll() is None:  # If process is still running
            print("Stopping FFmpeg process...")
            process.terminate()  # Send SIGTERM
            time.sleep(2)  # Give it some time to finish
            
            if process.poll() is None:  # If still running after SIGTERM
                process.kill()  # Force kill if necessary
                
        process.wait()  # Wait for process to finish
        
        stdout, stderr = process.communicate()
        if stderr:
            print(f"FFmpeg output: {stderr.decode()}")
            
    except Exception as e:
        print(f"Error during recording: {e}")
        if 'process' in locals() and process.poll() is None:
            process.kill()
    finally:
        recording = False

@app.post("/stop-recording")
async def stop_recording():
    global recording
    recording = False
    # Add a small delay to ensure the recording is properly finalized
    await asyncio.sleep(1)
    return {"status": "success", "message": "Recording stopped and saved"}

# Upload media endpoint
@app.post("/upload-media")
async def upload_media(file: UploadFile = File(...)) -> Dict[str, Any]:
    """
    Handles uploading media (image or video) and returns both the file path and URL.
    """
    try:
        upload_dir = "./uploaded_media"
        os.makedirs(upload_dir, exist_ok=True)
        file_path = os.path.join(upload_dir, file.filename)

        # Save the uploaded file
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())

        # Construct the file URL to be accessible by the frontend
        file_url = f"http://localhost:8000/uploaded_media/{file.filename}"

        return {"status": "success", "filePath": file_path, "fileUrl": file_url}
    except Exception as e:
        return {"status": "error", "message": str(e)}
