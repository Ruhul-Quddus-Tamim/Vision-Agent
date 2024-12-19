"use client";

import { ChatSection } from "@/components/ChatSection";
import { PreviewSection } from "@/components/PreviewSection";

export default function Component() {
  return (
    <div className="h-screen grid grid-cols-2 gap-4 p-4 bg-background">
      {/* Left: Chat Section */}
      <ChatSection />

      {/* Right: Live Camera Feed */}
      <PreviewSection />
    </div>
  );
}
