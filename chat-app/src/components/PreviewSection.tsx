"use client";

import { LiveCameraFeed } from "./LiveCameraFeed";

export function PreviewSection() {
  return (
    <div className="flex flex-col h-full p-6">
      {/* Camera Settings Header */}
      <div className="mb-4">
        <h2 className="text-lg font-medium text-foreground/90">Camera Settings</h2>
      </div>

      {/* Camera Feed with Connection Form */}
      <div className="flex-1 rounded-2xl overflow-hidden bg-black/20 border border-white/5">
        <LiveCameraFeed />
      </div>
    </div>
  );
}
