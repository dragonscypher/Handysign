import type { Page } from "@playwright/test";

export type CameraMockMode = "success" | "denied" | "unsupported";

type E2EHarnessMethod =
  | "clearAll"
  | "exportData"
  | "seedConsent"
  | "seedPersonalSign"
  | "seedWeakPersonalSign"
  | "seedStalePersonalSign"
  | "seedConfusionPair"
  | "seedReceipt";

export async function installMockMedia(
  page: Page,
  mode: CameraMockMode = "success",
) {
  await page.addInitScript(({ currentMode }) => {
    const browserWindow = window as typeof window & {
      __signRepairMediaTest?: {
        requestCount: number;
        stoppedTracks: number;
      };
    };

    browserWindow.__signRepairMediaTest = {
      requestCount: 0,
      stoppedTracks: 0,
    };

    class MockMediaStreamTrack {
      kind = "video";
      enabled = true;
      id = "mock-video-track";
      label = "Mock Camera";
      muted = false;
      readyState: MediaStreamTrackState = "live";

      stop() {
        browserWindow.__signRepairMediaTest!.stoppedTracks += 1;
        this.readyState = "ended";
      }

      addEventListener() {}

      removeEventListener() {}

      dispatchEvent() {
        return true;
      }
    }

    class MockMediaStream {
      id = "mock-media-stream";
      active = true;
      private readonly tracks = [new MockMediaStreamTrack()];

      getTracks() {
        return [...this.tracks];
      }

      getVideoTracks() {
        return [...this.tracks];
      }

      getAudioTracks() {
        return [];
      }

      addTrack() {}

      removeTrack() {}

      clone() {
        return this;
      }
    }

    Object.defineProperty(window, "MediaStreamTrack", {
      configurable: true,
      writable: true,
      value: MockMediaStreamTrack,
    });

    Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
      configurable: true,
      get() {
        return (this as HTMLMediaElement & { __signRepairSrcObject?: unknown })
          .__signRepairSrcObject ?? null;
      },
      set(value) {
        (this as HTMLMediaElement & { __signRepairSrcObject?: unknown })
          .__signRepairSrcObject = value;
      },
    });

    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value() {
        Object.defineProperty(this, "videoWidth", {
          configurable: true,
          value: 640,
        });
        Object.defineProperty(this, "videoHeight", {
          configurable: true,
          value: 480,
        });
        queueMicrotask(() => {
          this.dispatchEvent(new Event("loadedmetadata"));
        });
        return Promise.resolve();
      },
    });

    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value() {},
    });

    if (currentMode === "unsupported") {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(window, "MediaStream", {
        configurable: true,
        writable: true,
        value: undefined,
      });
      return;
    }

    Object.defineProperty(window, "MediaStream", {
      configurable: true,
      writable: true,
      value: MockMediaStream,
    });

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        async getUserMedia() {
          browserWindow.__signRepairMediaTest!.requestCount += 1;

          if (currentMode === "denied") {
            throw new DOMException("Permission denied", "NotAllowedError");
          }

          return new MockMediaStream();
        },
      },
    });
  }, { currentMode: mode });
}

export async function callE2EHarness<T = unknown>(
  page: Page,
  method: E2EHarnessMethod,
  ...args: unknown[]
) {
  await page.waitForFunction(
    (currentMethod) => {
      const api = (window as typeof window & {
        __signRepairE2E?: Record<string, (...innerArgs: unknown[]) => Promise<unknown>>;
      }).__signRepairE2E;

      return typeof api?.[currentMethod] === "function";
    },
    method,
  );

  return page.evaluate(
    async ({ currentMethod, currentArgs }) => {
      const api = (window as typeof window & {
        __signRepairE2E?: Record<string, (...innerArgs: unknown[]) => Promise<unknown>>;
      }).__signRepairE2E;

      if (!api?.[currentMethod]) {
        throw new Error(`Missing SignRepair E2E harness method: ${currentMethod}`);
      }

      const methodImpl = api[currentMethod] as (
        ...innerArgs: unknown[]
      ) => Promise<unknown>;

      return methodImpl(...(currentArgs as unknown[]));
    },
    {
      currentMethod: method,
      currentArgs: args,
    },
  ) as Promise<T>;
}

export async function readStoppedTrackCount(page: Page) {
  return page.evaluate(() => {
    return (
      (window as typeof window & {
        __signRepairMediaTest?: {
          stoppedTracks: number;
        };
      }).__signRepairMediaTest?.stoppedTracks ?? 0
    );
  });
}
