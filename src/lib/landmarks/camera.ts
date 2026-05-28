export type CameraStartFailureReason =
  | "unsupported-browser"
  | "permission-denied"
  | "device-unavailable"
  | "playback-failed";

export class CameraStartError extends Error {
  public readonly userMessage: string;

  constructor(
    public readonly reason: CameraStartFailureReason,
    message: string,
  ) {
    super(message);
    this.name = "CameraStartError";
    this.userMessage = message;
  }
}

function createCameraError(reason: CameraStartFailureReason) {
  switch (reason) {
    case "unsupported-browser":
      return new CameraStartError(
        reason,
        "This browser lacks required camera APIs for live on-device landmark capture. Try a secure-context Chromium browser, or use demo mode.",
      );
    case "permission-denied":
      return new CameraStartError(
        reason,
        "Camera permission was denied. Allow camera access for this site, then retry, or use demo mode.",
      );
    case "device-unavailable":
      return new CameraStartError(
        reason,
        "No usable camera stream was available. Check that a camera exists, is not busy in another app, and page is served over HTTPS or localhost.",
      );
    case "playback-failed":
      return new CameraStartError(
        reason,
        "Camera stream started but video playback could not begin in this browser session. Retry after reloading, or use demo mode.",
      );
    default:
      return new CameraStartError(
        "device-unavailable",
        "Camera setup failed. Retry camera access or use demo mode.",
      );
  }
}

function mapCameraError(error: unknown) {
  if (error instanceof CameraStartError) {
    return error;
  }

  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
      case "SecurityError":
        return createCameraError("permission-denied");
      case "NotFoundError":
      case "NotReadableError":
      case "OverconstrainedError":
      case "AbortError":
        return createCameraError("device-unavailable");
      default:
        return createCameraError("playback-failed");
    }
  }

  return createCameraError("device-unavailable");
}

export function supportsLiveCameraApis() {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean(
    window.isSecureContext &&
      typeof navigator.mediaDevices?.getUserMedia === "function" &&
      window.MediaStream &&
      window.HTMLVideoElement,
  );
}

export async function startUserCamera(video: HTMLVideoElement) {
  if (!supportsLiveCameraApis()) {
    throw createCameraError("unsupported-browser");
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });

    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;

    try {
      await video.play();
    } catch (error) {
      stopUserCamera(stream, video);
      throw mapCameraError(error);
    }

    return stream;
  } catch (error) {
    throw mapCameraError(error);
  }
}

export function stopUserCamera(
  stream: MediaStream | null,
  video?: HTMLVideoElement | null,
) {
  stream?.getTracks().forEach((track) => track.stop());

  if (video) {
    video.pause();
    video.srcObject = null;
  }
}
