import asyncio
import os
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
import os

os.environ["ANTHROPIC_API_KEY"] = "ANTHROPIC_API_KEY"
os.environ["OPENAI_API_KEY"] = "OPENAI_API_KEY"

from vision_agent.agent import VisionAgentV2
from vision_agent.agent.types import AgentMessage
from vision_agent.utils.execute import CodeInterpreterFactory

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
