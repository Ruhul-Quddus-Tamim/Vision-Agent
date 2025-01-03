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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
          <Button 
            variant="ghost" 
            size="sm"
            className="hover:bg-white/5 text-foreground"
          >
            {isOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>
        <span className="text-sm font-medium text-foreground/80">Observation</span>
      </div>
      <CollapsibleContent>
        <pre className="mt-2 p-3 rounded-lg bg-secondary/30 border border-white/5 overflow-x-auto">
          <code className="text-sm text-foreground font-mono">{content}</code>
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
      className={`message-bubble mb-4 ${
        message.role === "user" || message.role === "interaction_response"
          ? "ml-auto bg-primary/10 text-foreground"
          : message.role === "assistant"
          ? "mr-auto bg-white/10 text-foreground"
          : "mr-auto bg-secondary/10 text-foreground"
      } max-w-[80%] rounded-2xl p-4 shadow-sm border border-white/5`}
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
          <span className="text-muted-foreground font-medium text-sm mb-1 block">
            {message.role.toUpperCase()}
          </span>
          <div className="text-foreground">{message.content}</div>
        </div>
      )}
      {message.media &&
        message.media.map((media, idx) => (
          <div key={idx} className="mt-2">
            <a
              href={media.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary/80 hover:text-primary transition-colors"
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
  const [selectedModel, setSelectedModel] = useState<string>("vision-agent");

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

  const handleModelChange = (value: string) => {
    setSelectedModel(value);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("message") as HTMLInputElement;
    const messageContent = input.value.trim();
    if (!messageContent && !currentMedia) return;

    let newMessage: Message;

    if (messages.length > 0 && messages[messages.length - 1].role === "interaction") {
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
      const response = await fetch("http://localhost:8000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages,
          model: selectedModel,
        }),
      });

      if (!response.ok) throw new Error("Message submission failed");

      const data = await response.json();
      console.log("Response received:", data);
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
      setCurrentMedia(null);
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
    <Card className="flex flex-col h-[800px] bg-background/50 backdrop-blur-sm border-white/5">
      <div className="p-4 border-b border-white/5">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-medium text-foreground/90">Chat</h2>
          <Select value={selectedModel} onValueChange={handleModelChange}>
            <SelectTrigger className="w-[180px] rounded-xl bg-white/5 border-white/10 text-foreground hover:bg-white/10 transition-all duration-200 hover:shadow-lg hover:shadow-primary/10">
              <SelectValue placeholder="Select Model" />
            </SelectTrigger>
            <SelectContent className="bg-background/95 backdrop-blur-sm border border-white/10 rounded-xl shadow-xl animate-in fade-in-0 zoom-in-95 duration-200">
              <SelectItem 
                value="vision-agent" 
                className="text-foreground/90 hover:bg-white/5 cursor-pointer focus:bg-white/10 rounded-lg my-1 transition-colors"
              >
                <div className="flex items-center gap-2 px-1 py-0.5">
                  <div className="w-2 h-2 rounded-full bg-blue-400 shadow-sm shadow-blue-400/50"></div>
                  Vision Agent
                </div>
              </SelectItem>
              <SelectItem 
                value="gemini-pro" 
                className="text-foreground/90 hover:bg-white/5 cursor-pointer focus:bg-white/10 rounded-lg my-1 transition-colors"
              >
                <div className="flex items-center gap-2 px-1 py-0.5">
                  <div className="w-2 h-2 rounded-full bg-purple-400 shadow-sm shadow-purple-400/50"></div>
                  Gemini-1.5-pro
                </div>
              </SelectItem>
              <SelectItem 
                value="gemini-flash" 
                className="text-foreground/90 hover:bg-white/5 cursor-pointer focus:bg-white/10 rounded-lg my-1 transition-colors"
              >
                <div className="flex items-center gap-2 px-1 py-0.5">
                  <div className="w-2 h-2 rounded-full bg-green-400 shadow-sm shadow-green-400/50"></div>
                  Gemini-1.5-flash
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <ScrollArea className="flex-1 p-6">
        <div className="space-y-6">
          {messages
            .filter((message) => checkContent(message.content))
            .map((message, i) => (
              <MessageBubble key={i} message={message} />
            ))}
        </div>
      </ScrollArea>
      <div className="p-4 border-t border-white/5">
        <form onSubmit={handleSubmit} className="flex gap-3">
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
            className="hover:bg-white/5 transition-colors"
          >
            <Upload className="h-4 w-4" />
          </Button>
          <input
            name="message"
            className="flex-1 px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
            placeholder="Type your message..."
          />
          <Button 
            type="submit" 
            size="icon"
            className="rounded-xl bg-primary/10 hover:bg-primary/20 text-foreground transition-all"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </Card>
  );
}
