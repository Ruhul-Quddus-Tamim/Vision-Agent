import os

os.environ["ANTHROPIC_API_KEY"] = (
    "YOUR_ANTHROPIC_API_KEY"
)
os.environ["OPENAI_API_KEY"] = (
    "YOUR_OPENAI_API_KEY"
)

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
import google.generativeai as genai

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
app.mount(
    "/uploaded_media", StaticFiles(directory="uploaded_media"), name="uploaded_media"
)

# WebSocket clients
clients: List[WebSocket] = []
camera_clients: List[WebSocket] = []  # Clients subscribed to camera feed

# variables at the top with other global variables
recording = False
video_writer = None
camera_config = {
    "username": None,
    "password": None,
    "ip": None,
    "channel": None,
    "subtype": None,
}
ffmpeg_process = None

# Gemini API configuration
genai.configure(api_key="YOUR_GEMINI_API_KEY")

# global variable to store the latest uploaded file path
latest_uploaded_file = None

# Add a variable to track the current camera capture
current_cap = None


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
    fileUrl: str  # URL for frontend display


class Message(BaseModel):
    role: str
    content: str
    media: Optional[List[Media]] = None


# Add new model request schema
class ChatRequest(BaseModel):
    messages: List[Message]
    model: str = "vision-agent"


# Update Gemini handlers
async def handle_gemini_pro(messages: List[Dict[str, Any]]) -> Dict[str, Any]:
    try:
        global latest_uploaded_file
        model = genai.GenerativeModel(model_name="gemini-1.5-pro")

        # Check if there's a new uploaded file in the current message
        if messages[-1].get("media"):
            latest_uploaded_file = messages[-1]["media"][0]["filePath"]

        # Use the latest uploaded file if it exists
        video_or_image_file = ""
        if latest_uploaded_file:
            video_or_image_file = genai.upload_file(path=latest_uploaded_file)

            while video_or_image_file.state.name == "PROCESSING":
                await asyncio.sleep(1)
                video_or_image_file = genai.get_file(video_or_image_file.name)

            if video_or_image_file.state.name == "FAILED":
                raise ValueError("File processing failed")

        # Generate response using the latest file
        response = model.generate_content(
            (
                [video_or_image_file, messages[-1]["content"]]
                if video_or_image_file
                else messages[-1]["content"]
            ),
            request_options={"timeout": 600},
        )

        return {"role": "assistant", "content": f"<response>{response.text}</response>"}
    except Exception as e:
        return {
            "role": "assistant",
            "content": f"<response>Error in Gemini Pro: {str(e)}</response>",
        }


async def handle_gemini_flash(messages: List[Dict[str, Any]]) -> Dict[str, Any]:
    try:
        global latest_uploaded_file
        model = genai.GenerativeModel(model_name="gemini-1.5-flash")

        # Check if there's a new uploaded file in the current message
        if messages[-1].get("media"):
            latest_uploaded_file = messages[-1]["media"][0]["filePath"]

        # Use the latest uploaded file if it exists
        video_or_image_file = ""
        if latest_uploaded_file:
            video_or_image_file = genai.upload_file(path=latest_uploaded_file)

            while video_or_image_file.state.name == "PROCESSING":
                await asyncio.sleep(1)
                video_or_image_file = genai.get_file(video_or_image_file.name)

            if video_or_image_file.state.name == "FAILED":
                raise ValueError("File processing failed")

        # Generate response using the latest file
        response = model.generate_content(
            (
                [video_or_image_file, messages[-1]["content"]]
                if video_or_image_file
                else messages[-1]["content"]
            ),
            request_options={"timeout": 600},
        )

        return {"role": "assistant", "content": f"<response>{response.text}</response>"}
    except Exception as e:
        return {
            "role": "assistant",
            "content": f"<response>Error in Gemini Flash: {str(e)}</response>",
        }


# Message processing in background
async def process_messages_background(
    messages: List[Dict[str, Any]], model: str = "vision-agent"
):
    try:
        if model == "vision-agent":
            # Run Vision Agent in a separate thread to avoid event loop conflicts
            def run_vision_agent():
                try:
                    for message in messages:
                        if "media" in message and message["media"] is None:
                            del message["media"]
                        elif "media" in message and message["media"]:
                            message["media"] = [
                                media_item["filePath"]
                                for media_item in message["media"]
                            ]

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
                except Exception as e:
                    loop = asyncio.new_event_loop()
                    loop.run_until_complete(
                        _async_update_callback(
                            {
                                "role": "assistant",
                                "content": f"<response>Error in Vision Agent: {str(e)}</response>",
                            }
                        )
                    )
                    loop.close()

            # Run Vision Agent in a thread pool
            await asyncio.get_event_loop().run_in_executor(None, run_vision_agent)

        elif model == "gemini-pro":
            response = await handle_gemini_pro(messages)
            await _async_update_callback(response)
        elif model == "gemini-flash":
            response = await handle_gemini_flash(messages)
            await _async_update_callback(response)
        else:
            raise ValueError(f"Unknown model: {model}")

    except Exception as e:
        error_response = {
            "role": "assistant",
            "content": f"<response>Error processing request: {str(e)}</response>",
        }
        await _async_update_callback(error_response)


# Chat endpoint
@app.post("/chat")
async def chat(
    request: ChatRequest, background_tasks: BackgroundTasks
) -> Dict[str, Any]:
    # Run the process_messages_background directly as an async function
    await process_messages_background(
        [msg.dict() for msg in request.messages], request.model
    )
    return {
        "status": "Processing started",
        "message": f"Your messages are being processed using {request.model}",
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
    global camera_config, camera_clients, current_cap

    await websocket.accept()

    if not all(camera_config.values()):
        await websocket.send_json({"error": "Camera configuration incomplete"})
        return

    # Close existing camera connection if any
    if current_cap is not None:
        current_cap.release()
        current_cap = None

    camera_clients.append(websocket)
    print("Camera client connected.")

    rtsp_url = f"rtsp://{camera_config['username']}:{camera_config['password']}@{camera_config['ip']}:554/cam/realmonitor?channel={camera_config['channel']}&subtype={camera_config['subtype']}"

    try:
        current_cap = cv2.VideoCapture(rtsp_url)
        current_cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        current_cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc("M", "J", "P", "G"))
        current_cap.set(cv2.CAP_PROP_FPS, 30)

        if not current_cap.isOpened():
            await websocket.send_json({"error": "Unable to open camera stream"})
            if websocket in camera_clients:
                camera_clients.remove(websocket)
            return

        while True:
            if websocket not in camera_clients:
                break

            if not current_cap.isOpened():
                current_cap.release()
                current_cap = cv2.VideoCapture(rtsp_url)
                if not current_cap.isOpened():
                    await asyncio.sleep(1)
                    continue

            ret, frame = current_cap.read()
            if not ret:
                await asyncio.sleep(0.1)
                continue

            try:
                frame = cv2.resize(frame, (960, 720))
                _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                frame_base64 = base64.b64encode(buffer).decode("utf-8")

                await websocket.send_text(frame_base64)
                await asyncio.sleep(0.01)  # ~10fps
            except WebSocketDisconnect:
                break
            except RuntimeError:
                break
            except Exception as e:
                print(f"Error sending frame: {e}")
                await asyncio.sleep(0.1)
                continue

    except Exception as e:
        print(f"Error in camera feed: {e}")
    finally:
        if current_cap is not None:
            current_cap.release()
            current_cap = None
        if websocket in camera_clients:
            camera_clients.remove(websocket)
        print("Camera client disconnected.")


@app.websocket("/start-recording")
async def start_recording(websocket: WebSocket):
    global recording, camera_config, ffmpeg_process

    await websocket.accept()

    if not all(camera_config.values()):
        await websocket.send_json({"error": "Camera configuration is incomplete"})
        return

    # Create a unique RTSP URL for recording to avoid conflicts
    rtsp_url = (
        f"rtsp://{camera_config['username']}:{camera_config['password']}@"
        f"{camera_config['ip']}:554/cam/realmonitor?channel={camera_config['channel']}"
        f"&subtype={camera_config['subtype']}&recording=1"  # Add unique identifier
    )

    os.makedirs("recordings", exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = f"recordings/recording_{timestamp}.mp4"

    try:
        ffmpeg_cmd = [
            "ffmpeg",
            "-y",  # Overwrite output file if it exists
            "-f",
            "rtsp",
            "-rtsp_transport",
            "tcp",
            "-i",
            rtsp_url,
            "-c:v",
            "libx264",  # Use H.264 codec
            "-preset",
            "ultrafast",  # Faster encoding
            "-crf",
            "23",  # Quality (lower is better, 18-28 is good)
            "-vf",
            "scale=1200:720",  # Scale to 720p
            "-r",
            "30",  # 30 FPS
            "-async",
            "1",  # Audio sync
            output_path,
        ]

        # Start FFmpeg process
        startupinfo = None
        if os.name == "nt":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

        ffmpeg_process = subprocess.Popen(
            ffmpeg_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            startupinfo=startupinfo,
        )

        print(f"Started recording to {output_path}")
        recording = True

        await websocket.send_json({"status": "recording_started", "file": output_path})

        # Keep the recording WebSocket alive
        while recording and ffmpeg_process.poll() is None:
            try:
                await websocket.send_json({"status": "recording"})
                await asyncio.sleep(1)
            except WebSocketDisconnect:
                # Keep recording even if WebSocket disconnects
                break

    except Exception as e:
        print(f"Error during recording: {str(e)}")
        recording = False
        if ffmpeg_process and ffmpeg_process.poll() is None:
            ffmpeg_process.terminate()
    finally:
        pass  # Let stop_recording handle the cleanup


@app.post("/stop-recording")
async def stop_recording():
    global recording, ffmpeg_process

    if ffmpeg_process and ffmpeg_process.poll() is None:
        ffmpeg_process.terminate()
        try:
            ffmpeg_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            ffmpeg_process.kill()

        stdout, stderr = ffmpeg_process.communicate()
        if stderr:
            print(f"FFmpeg output: {stderr.decode()}")

    recording = False
    ffmpeg_process = None
    return {"status": "success"}


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


@app.post("/set-camera-config")
async def set_camera_config(data: dict):
    global camera_config
    camera_config.update(
        {
            "username": data.get("username"),
            "password": data.get("password"),
            "ip": data.get("ip"),
            "channel": data.get("channel"),
            "subtype": data.get("subtype"),
        }
    )
    return {"status": "success", "message": "Camera configuration set successfully"}
