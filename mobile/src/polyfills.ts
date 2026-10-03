// Apply runtime compatibility shims before importing LiveKit or livekit-client.
// Hermes may not provide DOMException, which WebRTC-related code can access at startup.
const runtime = globalThis as any;

if (typeof runtime.DOMException !== "function") {
  runtime.DOMException = class DOMException extends Error {
    constructor(message?: string, name?: string) {
      super(message);
      this.name = name ?? "Error";
    }
  };
}
