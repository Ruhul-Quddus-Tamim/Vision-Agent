"use client";

import { LiveCameraFeed } from "./LiveCameraFeed";

export function PreviewSection() {
  return (
    <div className="h-full w-full max-w-4xl mx-auto overflow-hidden rounded-lg">
      <LiveCameraFeed />
    </div>
  );
}
