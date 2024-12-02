"use client";

import { useState, useEffect } from "react";
import { Send, Upload, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface Media {
  filePath: string; // Local file path for backend processing
  fileUrl: string;  // URL for frontend display
}

interface Message {
  role:
    | "assistant"
    | "conversation"
    | "interaction"
    | "interaction_response"
    | "coder"
    | "planner"
    | "user"
    | "observation"
    | string; // Allow any other roles
  content: string;
  media?: Media[];
}

interface MessageBubbleProps {
  message: Message;
}

interface ChatSectionProps {
  onUploadedResult: (result: string) => void;
}

const CollapsibleMessage = ({ content }: { content: string }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex items-center justify-between">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm">
            {isOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>
        <span className="text-sm font-medium">Observation</span>
      </div>
      <CollapsibleContent>
        <pre className="pt-2 bg-gray-100 p-2 rounded-md overflow-x-auto">
          <code className="text-sm">{content}</code>
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
};

const checkContent = (content: string) => {
  const finalizePlanMatch = content.match(
    /<finalize_plan>(.*?)<\/finalize_plan>/s,
  );
  const finalCodeMatch = content.match(/<final_code>(.*?)<\/final_code>/s);
  return !(finalizePlanMatch || finalCodeMatch);
};

const formatAssistantContent = (role: string, content: string) => {
  const responseMatch = content.match(/<response>(.*?)<\/response>/s);
  const thinkingMatch = content.match(/<thinking>(.*?)<\/thinking>/s);
  const pythonMatch = content.match(/<execute_python>(.*?)<\/execute_python>/s);
  const finalPlanJsonMatch = content.match(/<json>(.*?)<\/json>/s);
  const interactionMatch = content.match(/<interaction>(.*?)<\/interaction>/s);
  const observationMatch = content.match(/<observation>(.*?)<\/observation>/s);

  const interactionJson = interactionMatch
    ? JSON.parse(interactionMatch[1])
    : null;

  const finalPlanJson = finalPlanJsonMatch
    ? JSON.parse(finalPlanJsonMatch[1])
    : null;

  if (finalPlanJson && finalPlanJson.plan && finalPlanJson.instructions) {
    return (
      <>
        <div>
          <strong className="text-gray-700">[{role.toUpperCase()}]</strong>{" "}
          {finalPlanJson.plan}
        </div>
        <pre className="bg-gray-800 text-white p-1.5 rounded mt-2 overflow-x-auto text-xs">
          <code style={{ whiteSpace: "pre-wrap" }}>
            {Array.isArray(finalPlanJson.instructions)
              ? "-" + finalPlanJson.instructions.join("\n-")
              : finalPlanJson.instructions}
          </code>
        </pre>
      </>
    );
  }

  if (interactionMatch && interactionJson) {
    return (
      <>
        <div>
          <strong className="text-gray-700">[{role.toUpperCase()}]</strong>{" "}
          Function calls:
        </div>
        <pre className="bg-gray-800 text-white p-1.5 rounded mt-2 overflow-x-auto text-xs">
          <code style={{ whiteSpace: "pre-wrap" }}>
            {interactionJson
              .map(
                (interaction: { request: { function_name: string } }) =>
                  `- ${interaction.request.function_name}`,
              )
              .join("\n")}
          </code>
        </pre>
      </>
    );
  }

  if (responseMatch || thinkingMatch || pythonMatch) {
    return (
      <>
        {thinkingMatch && (
          <div>
            <strong className="text-gray-700">[THINKING]</strong>{" "}
            {thinkingMatch[1]}
          </div>
        )}
        {responseMatch && (
          <div>
            <strong className="text-gray-700">[RESPONSE]</strong>{" "}
            {responseMatch[1]}
          </div>
        )}
        {pythonMatch && (
          <div>
            <strong className="text-gray-700">[EXECUTE PYTHON]</strong>
            <pre className="bg-gray-800 text-white p-1.5 rounded mt-2 overflow-x-auto text-xs">
              <code>{pythonMatch[1].trim()}</code>
            </pre>
          </div>
        )}
      </>
    );
  }

  if (observationMatch) {
    return <CollapsibleMessage content={observationMatch[1]} />;
  }

  return (
    <div>
      <strong className="text-gray-700">[{role.toUpperCase()}]</strong>{" "}
      {content}
    </div>
  );
};

export function MessageBubble({ message }: MessageBubbleProps) {
  return (
    <div
      className={`mb-4 ${
        message.role === "user" || message.role === "interaction_response"
          ? "ml-auto bg-primary text-primary-foreground"
          : message.role === "assistant"
          ? "mr-auto bg-muted"
          : "mr-auto bg-secondary"
      } max-w-[80%] rounded-lg p-3`}
    >
      {message.role === "observation" ? (
        <CollapsibleMessage content={message.content} />
      ) : message.role === "assistant" ||
        message.role === "conversation" ||
        message.role === "planner" ||
        message.role === "interaction" ||
        message.role === "coder" ||
        message.role === "thinking" ||
        message.role === "execute_python" ? (
        formatAssistantContent(message.role, message.content)
      ) : (
        <div>
          <strong className="text-gray-700">[{message.role.toUpperCase()}]</strong>{" "}
          {message.content}
        </div>
      )}
      {/* Render media if any */}
      {message.media &&
        message.media.map((media, idx) => (
          <div key={idx} className="mt-2">
            <a
              href={media.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline"
            >
              View Media
            </a>
          </div>
        ))}
    </div>
  );
}

export function ChatSection({ onUploadedResult }: ChatSectionProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMedia, setCurrentMedia] = useState<Media | null>(null);

  // Establish WebSocket connection
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/ws");

    ws.onopen = () => {
      console.log("WebSocket connection established");
    };

    ws.onmessage = (event) => {
      console.log("Received event", event);
      const data = JSON.parse(event.data);

      // If 'role' is missing, default to 'assistant'
      const role = data.role || "assistant";
      const message: Message = {
        role,
        content: data.content,
        media: data.media,
      };

      setMessages((prev) => [...prev, message]);
      handleFinalCode(message); // Call the function here
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("WebSocket connection closed");
    };

    return () => {
      ws.close();
    };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://localhost:8000/upload-media", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("File upload failed");
      }

      const data = await response.json();
      console.log("File uploaded successfully:", data);

      // Set the uploaded file's paths
      setCurrentMedia({ filePath: data.filePath, fileUrl: data.fileUrl });
    } catch (error) {
      console.error("Error uploading file:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem(
      "message",
    ) as HTMLInputElement;
    const messageContent = input.value.trim();
    if (!messageContent && !currentMedia) return;

    let newMessage: Message;

    if (
      messages.length > 0 &&
      messages[messages.length - 1].role === "interaction"
    ) {
      newMessage = {
        role: "interaction_response",
        content: JSON.stringify({ function_name: messageContent }),
      };
    } else {
      newMessage = {
        role: "user",
        content: messageContent,
        media: currentMedia ? [currentMedia] : undefined,
      };
    }

    const updatedMessages = [...messages, newMessage];
    setMessages(updatedMessages);

    try {
      console.log("Sending message:", newMessage);
      const response = await fetch("http://localhost:8000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedMessages),
      });

      if (!response.ok) throw new Error("Message submission failed");

      const data = await response.json();
      console.log("Response received:", data);

      // The assistant's response will come through WebSocket, so we don't handle it here
    } catch (error) {
      console.error("Error submitting message:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, there was an error processing your request.",
        },
      ]);
    } finally {
      input.value = "";
      setCurrentMedia(null); // Reset current media after sending the message
    }
  };

  const handleFinalCode = (message: Message) => {
    const finalCodeMatch = message.content.match(
      /<final_code>(.*?)<\/final_code>/s,
    );
    if (finalCodeMatch) {
      const finalCode = finalCodeMatch[1];
      console.log("Final Code:", finalCode);
      // Handle the final code as needed (e.g., display in the code tab)

      // Check if the message includes media (annotated image)
      if (message.media && message.media.length > 0) {
        const annotatedImageUrl = message.media[message.media.length - 1].fileUrl;
        onUploadedResult(annotatedImageUrl);
      }
    }
  };

  return (
    <Card className="flex flex-col h-[800px]">
      <ScrollArea className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-4">
          {messages
            .filter((message) => checkContent(message.content))
            .map((message, i) => (
              <MessageBubble key={i} message={message} />
            ))}
        </div>
      </ScrollArea>
      <div className="p-4 border-t">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="file"
            id="file-upload"
            className="hidden"
            onChange={handleFileUpload}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => document.getElementById("file-upload")?.click()}
          >
            <Upload className="h-4 w-4" />
          </Button>
          <input
            name="message"
            className="flex-1 px-3 py-2 rounded-md border"
            placeholder="Type your message..."
          />
          <Button type="submit" size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </Card>
  );
}
