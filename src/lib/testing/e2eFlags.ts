import type { ReadonlyURLSearchParams } from "next/navigation";

export type LiveE2EScenario =
  | "confusion-twin"
  | "cue-patch-mouth"
  | "cue-patch-hand"
  | null;
export interface LiveE2EFlags {
  forceMockLandmarks: boolean;
  forceMockVerification: boolean;
  scenario: LiveE2EScenario;
}

type SearchSource =
  | ReadonlyURLSearchParams
  | URLSearchParams
  | {
      forceMockLandmarks?: string | string[] | null;
      forceMockVerification?: string | string[] | null;
      e2eScenario?: string | string[] | null;
    }
  | null
  | undefined;

function firstValue(value: string | string[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function readValue(
  source: SearchSource,
  key: "forceMockLandmarks" | "forceMockVerification" | "e2eScenario",
) {
  if (!source) {
    return null;
  }

  if ("get" in source) {
    return source.get(key);
  }

  return firstValue(source[key]);
}

function parseScenario(value: string | null): LiveE2EScenario {
  return value === "confusion-twin" ||
    value === "cue-patch-mouth" ||
    value === "cue-patch-hand"
    ? value
    : null;
}

export function signRepairE2EEnabled() {
  return process.env.NEXT_PUBLIC_SIGNREPAIR_E2E === "1";
}

export function readLiveE2EFlags(source: SearchSource) {
  if (!signRepairE2EEnabled()) {
    return {
      forceMockLandmarks: false,
      forceMockVerification: false,
      scenario: null as LiveE2EScenario,
    } satisfies LiveE2EFlags;
  }

  return {
    forceMockLandmarks: readValue(source, "forceMockLandmarks") === "1",
    forceMockVerification: readValue(source, "forceMockVerification") === "1",
    scenario: parseScenario(readValue(source, "e2eScenario")),
  } satisfies LiveE2EFlags;
}

export function serializeLiveE2EQuery(flags: LiveE2EFlags) {
  if (!flags.forceMockLandmarks && !flags.forceMockVerification && !flags.scenario) {
    return "";
  }

  const params = new URLSearchParams();

  if (flags.forceMockLandmarks) {
    params.set("forceMockLandmarks", "1");
  }

  if (flags.forceMockVerification) {
    params.set("forceMockVerification", "1");
  }

  if (flags.scenario) {
    params.set("e2eScenario", flags.scenario);
  }

  const query = params.toString();

  return query ? `?${query}` : "";
}

export function buildLiveE2EQuery(searchParams: ReadonlyURLSearchParams | null) {
  return serializeLiveE2EQuery(readLiveE2EFlags(searchParams));
}
