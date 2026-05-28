export interface LoadedClip {
  fileName: string;
  objectUrl: string;
  video: HTMLVideoElement;
  durationMs: number;
  width: number;
  height: number;
  cleanup: () => void;
}

export interface VideoAnalysisGuardResult {
  ok: boolean;
  reason:
    | "ready"
    | "invalid-timestamp"
    | "invalid-duration"
    | "missing-dimensions"
    | "ready-state-low"
    | "frame-not-decoded"
    | "seek-not-settled";
  details?: string;
}

const HAVE_METADATA = 1;
const HAVE_CURRENT_DATA = 2;

function waitForEvent(
  target: HTMLVideoElement,
  type: "loadedmetadata" | "seeked" | "error",
) {
  return new Promise<void>((resolve, reject) => {
    const handleSuccess = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error(`ClipLoader event failed: ${type}`));
    };
    const cleanup = () => {
      target.removeEventListener(type, handleSuccess);
      target.removeEventListener("error", handleError);
    };

    target.addEventListener(type, handleSuccess, { once: true });
    target.addEventListener("error", handleError, { once: true });
  });
}

function waitForReadyState(
  video: HTMLVideoElement,
  minimumReadyState: number,
  timeoutMs = 1500,
) {
  if (video.readyState >= minimumReadyState) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();

    const tick = () => {
      if (video.readyState >= minimumReadyState) {
        resolve();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(
          new Error(
            `ClipLoader readyState timeout: need ${minimumReadyState}, got ${video.readyState}.`,
          ),
        );
        return;
      }

      window.setTimeout(tick, 16);
    };

    tick();
  });
}

export function inspectVideoFrameForAnalysis(
  video: HTMLVideoElement,
  timeSeconds: number,
): VideoAnalysisGuardResult {
  if (!Number.isFinite(timeSeconds)) {
    return {
      ok: false,
      reason: "invalid-timestamp",
      details: "Timestamp is not finite.",
    };
  }

  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    return {
      ok: false,
      reason: "invalid-duration",
      details: "Video duration is missing, NaN, or zero.",
    };
  }

  if (!video.videoWidth || !video.videoHeight) {
    return {
      ok: false,
      reason: "missing-dimensions",
      details: "Video dimensions are missing.",
    };
  }

  if (video.readyState < HAVE_CURRENT_DATA) {
    return {
      ok: false,
      reason: "ready-state-low",
      details: `readyState ${video.readyState} is below HAVE_CURRENT_DATA.`,
    };
  }

  if (!Number.isFinite(video.currentTime)) {
    return {
      ok: false,
      reason: "frame-not-decoded",
      details: "Video currentTime is not finite.",
    };
  }

  if (Math.abs(video.currentTime - timeSeconds) > 0.15) {
    return {
      ok: false,
      reason: "seek-not-settled",
      details: `currentTime ${video.currentTime.toFixed(3)} does not match requested ${timeSeconds.toFixed(3)}.`,
    };
  }

  return {
    ok: true,
    reason: "ready",
  };
}

async function waitForDecodedFrame(video: HTMLVideoElement, timeoutMs = 1500) {
  await waitForReadyState(video, HAVE_CURRENT_DATA, timeoutMs);

  // After `seeked`, paused videos often already have usable current-frame data.
  // Avoid waiting full timeout per frame when browsers never fire
  // `requestVideoFrameCallback` for paused seek snapshots.
  if (video.paused) {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 32);
    });
    return;
  }

  if ("requestVideoFrameCallback" in video) {
    await new Promise<void>((resolve) => {
      let callbackId = 0;
      let timeoutId = 0;
      const element = video as HTMLVideoElement & {
        requestVideoFrameCallback?: (callback: () => void) => number;
        cancelVideoFrameCallback?: (handle: number) => void;
      };

      const cleanup = () => {
        if (callbackId && element.cancelVideoFrameCallback) {
          element.cancelVideoFrameCallback(callbackId);
        }
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
      };

      callbackId = element.requestVideoFrameCallback?.(() => {
        cleanup();
        resolve();
      }) ?? 0;

      timeoutId = window.setTimeout(() => {
        cleanup();
        resolve();
      }, Math.min(timeoutMs, 180));
    });
  }
}

export async function loadClipFile(file: File): Promise<LoadedClip> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");

  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;
  video.style.position = "fixed";
  video.style.left = "-10000px";
  video.style.top = "-10000px";
  video.style.pointerEvents = "none";
  document.body.appendChild(video);

  try {
    if (video.readyState < HAVE_METADATA) {
      await waitForEvent(video, "loadedmetadata");
    }

    await waitForReadyState(video, HAVE_METADATA);

    if ((!video.videoWidth || !video.videoHeight) && video.readyState < HAVE_CURRENT_DATA) {
      await waitForReadyState(video, HAVE_CURRENT_DATA);
    }

    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error("ClipLoader could not read valid clip duration from uploaded video.");
    }

    if (!video.videoWidth || !video.videoHeight) {
      throw new Error("ClipLoader could not read valid clip dimensions from uploaded video.");
    }

    return {
      fileName: file.name,
      objectUrl,
      video,
      durationMs: Math.round(video.duration * 1000),
      width: video.videoWidth,
      height: video.videoHeight,
      cleanup: () => {
        video.pause();
        video.remove();
        URL.revokeObjectURL(objectUrl);
      },
    };
  } catch (error) {
    video.remove();
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export async function seekVideo(video: HTMLVideoElement, timeSeconds: number) {
  if (!Number.isFinite(timeSeconds)) {
    throw new Error("ClipLoader cannot seek to non-finite timestamp.");
  }

  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    throw new Error("ClipLoader cannot seek because clip duration is invalid.");
  }

  const safeTime = Math.max(0, Math.min(timeSeconds, Math.max(video.duration - 0.05, 0)));

  if (Math.abs(video.currentTime - safeTime) >= 0.01) {
    video.currentTime = safeTime;
    await waitForEvent(video, "seeked");
  }

  await waitForDecodedFrame(video);

  const guard = inspectVideoFrameForAnalysis(video, safeTime);

  if (!guard.ok) {
    throw new Error(`ClipLoader frame guard failed: ${guard.reason}. ${guard.details ?? ""}`.trim());
  }

  if (Math.abs(video.currentTime - safeTime) < 0.01) {
    return;
  }
}
