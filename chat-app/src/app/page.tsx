"use client";

import { ChatSection } from "@/components/ChatSection";
import { PreviewSection } from "@/components/PreviewSection";

export default function Component() {
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-background via-background/95 to-background/90">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-grid opacity-[0.02] pointer-events-none" />
      
      {/* Subtle glow effects */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px]" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[100px]" />

      {/* Main content */}
      <div className="relative z-10 h-screen grid grid-cols-2 gap-8 p-8">
        {/* Left: Chat Section */}
        <div className="backdrop-blur-sm bg-card/30 rounded-3xl border border-white/5 shadow-lg transition-all duration-500 hover:border-white/10">
          <ChatSection />
        </div>

        {/* Right: Live Camera Feed */}
        <div className="backdrop-blur-sm bg-card/30 rounded-3xl border border-white/5 shadow-lg transition-all duration-500 hover:border-white/10">
          <PreviewSection />
        </div>
      </div>
    </div>
  );
}
