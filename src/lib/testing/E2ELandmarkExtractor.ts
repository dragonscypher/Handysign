import type { CuePatchKind } from "@/lib/repair/CuePatch";
import {
  createE2EConfusionTwinSnapshot,
  createE2ECuePatchSnapshot,
} from "@/lib/testing/e2eFixtures";
import type { LiveE2EScenario } from "@/lib/testing/e2eFlags";
import type {
  LandmarkExtractor,
  LandmarkListener,
  LandmarkSnapshot,
} from "@/lib/landmarks/types";

export class E2ELandmarkExtractor implements LandmarkExtractor {
  private readonly listeners = new Set<LandmarkListener>();
  private timer: number | null = null;

  constructor(private readonly scenario: NonNullable<LiveE2EScenario>) {}

  async start(video: HTMLVideoElement) {
    void video;
    this.emitSnapshot("before", 40);
  }

  stop() {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  subscribe(listener: LandmarkListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getKind() {
    return "mock" as const;
  }

  requestCuePatch(kind: CuePatchKind) {
    void kind;

    if (this.scenario === "confusion-twin") {
      return;
    }

    this.emitSnapshot("after", 120);
  }

  private emitSnapshot(phase: "before" | "after", delayMs: number) {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
    }

    this.timer = window.setTimeout(() => {
      const snapshot = this.createSnapshot(phase);

      for (const listener of this.listeners) {
        listener(snapshot);
      }

      this.timer = null;
    }, delayMs);
  }

  private createSnapshot(phase: "before" | "after"): LandmarkSnapshot {
    if (this.scenario === "cue-patch-mouth" || this.scenario === "cue-patch-hand") {
      return createE2ECuePatchSnapshot(this.scenario, phase);
    }

    return createE2EConfusionTwinSnapshot();
  }
}
