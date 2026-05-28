import type { LandmarkFrame } from "@/lib/landmarks/types";

export interface ClipSegment {
  id: string;
  startMs: number;
  endMs: number;
  frames: LandmarkFrame[];
  averageMotion: number;
  peakMotion: number;
  holdRatio: number;
  directionChanges: number;
}

export interface SegmenterOptions {
  targetSegments?: number;
  minFramesPerSegment?: number;
  pauseFrameStreak?: number;
  lowMotionThreshold?: number;
  mode?: "benchmark" | "blind";
  maxFramesPerSegment?: number;
}

function handAnchors(frame: LandmarkFrame) {
  return frame.hands
    .map((hand) => hand.landmarks[0] ?? null)
    .filter((point): point is NonNullable<typeof point> => Boolean(point));
}

function faceAnchor(frame: LandmarkFrame) {
  return frame.mouth[0] ?? frame.face?.landmarks[1] ?? null;
}

function poseAnchor(frame: LandmarkFrame) {
  const leftShoulder = frame.pose?.landmarks[11];
  const rightShoulder = frame.pose?.landmarks[12];

  if (!leftShoulder || !rightShoulder) {
    return null;
  }

  return {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2,
    z: (leftShoulder.z + rightShoulder.z) / 2,
  };
}

function frameMotion(previous: LandmarkFrame, current: LandmarkFrame) {
  const previousHands = handAnchors(previous);
  const currentHands = handAnchors(current);

  if (previousHands.length && currentHands.length) {
    const handMotion =
      currentHands
        .slice(0, Math.min(previousHands.length, currentHands.length))
        .reduce(
          (sum, hand, index) =>
            sum +
            Math.hypot(
              hand.x - previousHands[index]!.x,
              hand.y - previousHands[index]!.y,
            ),
          0,
        ) / Math.min(previousHands.length, currentHands.length);
    const previousFace = faceAnchor(previous);
    const currentFace = faceAnchor(current);
    const previousPose = poseAnchor(previous);
    const currentPose = poseAnchor(current);
    const faceMotion =
      previousFace && currentFace
        ? Math.hypot(currentFace.x - previousFace.x, currentFace.y - previousFace.y)
        : 0;
    const poseMotion =
      previousPose && currentPose
        ? Math.hypot(currentPose.x - previousPose.x, currentPose.y - previousPose.y)
        : 0;

    return handMotion * 0.72 + faceMotion * 0.14 + poseMotion * 0.14;
  }

  if (!previous.quality.handVisible || !current.quality.handVisible) {
    const previousFace = faceAnchor(previous);
    const currentFace = faceAnchor(current);

    if (previousFace && currentFace) {
      return Math.hypot(currentFace.x - previousFace.x, currentFace.y - previousFace.y) * 0.2;
    }

    return 0.002;
  }

  return 0;
}

function motionSeries(frames: LandmarkFrame[]) {
  const motions: number[] = [];

  for (let index = 1; index < frames.length; index += 1) {
    motions.push(frameMotion(frames[index - 1]!, frames[index]!));
  }

  return motions;
}

function primaryWrist(frame: LandmarkFrame) {
  return frame.hands[0]?.landmarks[0] ?? null;
}

function summarizeMotion(frames: LandmarkFrame[]) {
  if (frames.length < 2) {
    return {
      averageMotion: 0,
      peakMotion: 0,
      holdRatio: 1,
      directionChanges: 0,
    };
  }

  const motions = motionSeries(frames);
  const averageMotion =
    motions.reduce((sum, value) => sum + value, 0) / Math.max(motions.length, 1);
  const peakMotion = motions.length ? Math.max(...motions) : 0;
  const holdRatio =
    motions.filter((value) => value <= 0.01).length / Math.max(motions.length, 1);
  let directionChanges = 0;
  let previousDirection = 0;

  for (let index = 1; index < frames.length; index += 1) {
    const previous = primaryWrist(frames[index - 1]!);
    const current = primaryWrist(frames[index]!);

    if (!previous || !current) {
      continue;
    }

    const deltaX = current.x - previous.x;
    const direction = deltaX === 0 ? 0 : deltaX > 0 ? 1 : -1;

    if (direction !== 0 && previousDirection !== 0 && direction !== previousDirection) {
      directionChanges += 1;
    }

    if (direction !== 0) {
      previousDirection = direction;
    }
  }

  return {
    averageMotion,
    peakMotion,
    holdRatio,
    directionChanges,
  };
}

function segmentFromFrames(id: string, frames: LandmarkFrame[]): ClipSegment {
  const summary = summarizeMotion(frames);

  return {
    id,
    startMs: frames[0]!.timestamp,
    endMs: frames.at(-1)!.timestamp,
    frames,
    ...summary,
  };
}

function splitLongestSegment(segments: ClipSegment[]) {
  let longestIndex = -1;
  let longestLength = -1;

  for (let index = 0; index < segments.length; index += 1) {
    const length = segments[index]!.frames.length;

    if (length > longestLength) {
      longestLength = length;
      longestIndex = index;
    }
  }

  if (longestIndex < 0 || longestLength < 2) {
    return segments;
  }

  const target = segments[longestIndex]!;
  const midpoint = Math.floor(target.frames.length / 2);
  const firstFrames = target.frames.slice(0, midpoint);
  const secondFrames = target.frames.slice(midpoint);

  return [
    ...segments.slice(0, longestIndex),
    segmentFromFrames(`${target.id}-a`, firstFrames),
    segmentFromFrames(`${target.id}-b`, secondFrames),
    ...segments.slice(longestIndex + 1),
  ];
}

function mergeSoftestBoundary(segments: ClipSegment[]) {
  if (segments.length < 2) {
    return segments;
  }

  let mergeIndex = 0;
  let lowestScore = Number.POSITIVE_INFINITY;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const current = segments[index]!;
    const next = segments[index + 1]!;
    const score = current.averageMotion + next.averageMotion;

    if (score < lowestScore) {
      lowestScore = score;
      mergeIndex = index;
    }
  }

  const first = segments[mergeIndex]!;
  const second = segments[mergeIndex + 1]!;
  const mergedFrames = [...first.frames, ...second.frames];

  return [
    ...segments.slice(0, mergeIndex),
    segmentFromFrames(`${first.id}-${second.id}`, mergedFrames),
    ...segments.slice(mergeIndex + 2),
  ];
}

function mergeShortSegments(segments: ClipSegment[], minFramesPerSegment: number) {
  let merged = [...segments];

  while (merged.some((segment) => segment.frames.length < minFramesPerSegment) && merged.length > 1) {
    const index = merged.findIndex((segment) => segment.frames.length < minFramesPerSegment);

    if (index < 0) {
      break;
    }

    if (index === 0) {
      merged = [
        segmentFromFrames(
          `${merged[0]!.id}-${merged[1]!.id}`,
          [...merged[0]!.frames, ...merged[1]!.frames],
        ),
        ...merged.slice(2),
      ];
      continue;
    }

    const previous = merged[index - 1]!;
    const current = merged[index]!;
    const next = merged[index + 1] ?? null;

    if (!next) {
      merged = [
        ...merged.slice(0, index - 1),
        segmentFromFrames(
          `${previous.id}-${current.id}`,
          [...previous.frames, ...current.frames],
        ),
      ];
      continue;
    }

    const previousScore = Math.abs(previous.averageMotion - current.averageMotion);
    const nextScore = Math.abs(next.averageMotion - current.averageMotion);

    if (previousScore <= nextScore) {
      merged = [
        ...merged.slice(0, index - 1),
        segmentFromFrames(
          `${previous.id}-${current.id}`,
          [...previous.frames, ...current.frames],
        ),
        ...merged.slice(index + 1),
      ];
    } else {
      merged = [
        ...merged.slice(0, index),
        segmentFromFrames(
          `${current.id}-${next.id}`,
          [...current.frames, ...next.frames],
        ),
        ...merged.slice(index + 2),
      ];
    }
  }

  return merged;
}

function splitLongSegments(segments: ClipSegment[], maxFramesPerSegment: number) {
  let current = [...segments];

  while (current.some((segment) => segment.frames.length > maxFramesPerSegment)) {
    const index = current.findIndex((segment) => segment.frames.length > maxFramesPerSegment);
    const target = current[index]!;
    const motions = motionSeries(target.frames);

    if (motions.length < 4) {
      break;
    }

    const middleStart = Math.floor(motions.length * 0.3);
    const middleEnd = Math.ceil(motions.length * 0.7);
    let boundary = Math.floor(target.frames.length / 2);
    let lowestMotion = Number.POSITIVE_INFINITY;

    for (let motionIndex = middleStart; motionIndex < middleEnd; motionIndex += 1) {
      if (motions[motionIndex]! < lowestMotion) {
        lowestMotion = motions[motionIndex]!;
        boundary = motionIndex + 1;
      }
    }

    const firstFrames = target.frames.slice(0, boundary);
    const secondFrames = target.frames.slice(boundary);

    if (!firstFrames.length || !secondFrames.length) {
      break;
    }

    current = [
      ...current.slice(0, index),
      segmentFromFrames(`${target.id}-a`, firstFrames),
      segmentFromFrames(`${target.id}-b`, secondFrames),
      ...current.slice(index + 1),
    ];
  }

  return current;
}

export function segmentLandmarkFrames(
  frames: LandmarkFrame[],
  options: SegmenterOptions = {},
) {
  if (!frames.length) {
    return [] satisfies ClipSegment[];
  }

  const minFramesPerSegment = options.minFramesPerSegment ?? 6;
  const pauseFrameStreak = options.pauseFrameStreak ?? 3;
  const lowMotionThreshold = options.lowMotionThreshold ?? 0.01;
  const maxFramesPerSegment = options.maxFramesPerSegment ?? 18;
  const boundaries = new Set<number>();
  let lowMotionRun = 0;
  let highMotionSeen = false;

  for (let index = 1; index < frames.length; index += 1) {
    const motion = frameMotion(frames[index - 1]!, frames[index]!);

    if (motion <= lowMotionThreshold) {
      lowMotionRun += 1;
    } else {
      lowMotionRun = 0;
      if (motion >= lowMotionThreshold * 1.8) {
        highMotionSeen = true;
      }
    }

    const currentLength = index - (Array.from(boundaries).at(-1) ?? 0);

    if (
      lowMotionRun >= pauseFrameStreak &&
      currentLength >= minFramesPerSegment &&
      highMotionSeen
    ) {
      boundaries.add(index);
      lowMotionRun = 0;
      highMotionSeen = false;
    }
  }

  const sortedBoundaries = Array.from(boundaries).sort((left, right) => left - right);
  const segments: ClipSegment[] = [];
  let start = 0;

  for (const boundary of [...sortedBoundaries, frames.length]) {
    const segmentFrames = frames.slice(start, boundary);

    if (segmentFrames.length) {
      segments.push(
        segmentFromFrames(`seg-${String(segments.length + 1).padStart(2, "0")}`, segmentFrames),
      );
    }

    start = boundary;
  }

  const targetSegments = options.targetSegments;
  let normalizedSegments = segments.length
    ? segments
    : [segmentFromFrames("seg-01", frames)];

  if (options.mode === "blind") {
    normalizedSegments = mergeShortSegments(normalizedSegments, minFramesPerSegment);
    normalizedSegments = splitLongSegments(normalizedSegments, maxFramesPerSegment);
  }

  if (targetSegments && targetSegments > 0) {
    while (normalizedSegments.length < targetSegments) {
      normalizedSegments = splitLongestSegment(normalizedSegments);
      if (normalizedSegments.length === 1 && normalizedSegments[0]!.frames.length < 2) {
        break;
      }
    }

    while (normalizedSegments.length > targetSegments) {
      normalizedSegments = mergeSoftestBoundary(normalizedSegments);
    }
  }

  return normalizedSegments.map((segment, index) => ({
    ...segment,
    id: `seg-${String(index + 1).padStart(2, "0")}`,
  }));
}
