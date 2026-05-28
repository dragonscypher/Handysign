import type { LandmarkFrame, Point3D } from "@/lib/landmarks/types";
import type { DominantHand, EncodedSequence } from "@/lib/recognition/types";
import {
  HAND_SAMPLE_INDICES,
  averagePoint,
  buildCentroid,
  clamp01,
  deriveMouthStability,
  distance2D,
  mean,
  normalizePoint,
  safeDivide,
} from "./normalize";

const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;

function getFaceCenter(frame: LandmarkFrame): Point3D {
  const mouth = frame.mouth[0];

  if (mouth) {
    return mouth;
  }

  const face = frame.face?.landmarks;

  if (face?.length) {
    return face[1] ?? face[0];
  }

  return { x: 0.5, y: 0.35, z: 0 };
}

function getReference(frame: LandmarkFrame) {
  const pose = frame.pose?.landmarks;

  if (pose?.length) {
    const leftShoulder = pose[LEFT_SHOULDER];
    const rightShoulder = pose[RIGHT_SHOULDER];
    const leftHip = pose[LEFT_HIP];
    const rightHip = pose[RIGHT_HIP];

    if (leftShoulder && rightShoulder) {
      return {
        center: {
          x: mean([
            leftShoulder.x,
            rightShoulder.x,
            leftHip?.x ?? leftShoulder.x,
            rightHip?.x ?? rightShoulder.x,
          ]),
          y: mean([
            leftShoulder.y,
            rightShoulder.y,
            leftHip?.y ?? leftShoulder.y + 0.2,
            rightHip?.y ?? rightShoulder.y + 0.2,
          ]),
          z: 0,
        },
        scale: Math.max(distance2D(leftShoulder, rightShoulder), 0.2),
        shoulderY: mean([leftShoulder.y, rightShoulder.y]),
      };
    }
  }

  const center = getFaceCenter(frame);

  return {
    center,
    scale: 0.24,
    shoulderY: center.y + 0.08,
  };
}

function pickDominantHand(buffer: LandmarkFrame[]): DominantHand {
  const leftCount = buffer.filter((frame) =>
    frame.hands.some((hand) => hand.handedness === "left"),
  ).length;
  const rightCount = buffer.filter((frame) =>
    frame.hands.some((hand) => hand.handedness === "right"),
  ).length;

  if (leftCount === 0 && rightCount === 0) {
    return "unknown";
  }

  return rightCount >= leftCount ? "right" : "left";
}

function selectHand(frame: LandmarkFrame, dominantHand: DominantHand) {
  if (dominantHand !== "unknown") {
    const matching = frame.hands.find(
      (hand) => hand.handedness === dominantHand,
    );

    if (matching) {
      return matching;
    }
  }

  return frame.hands[0] ?? null;
}

function blendshape(
  frame: LandmarkFrame,
  keys: string[],
  fallback = 0,
): number {
  const map = frame.face?.blendshapes ?? {};
  const values = keys
    .map((key) => map[key])
    .filter((value): value is number => typeof value === "number");

  if (!values.length) {
    return fallback;
  }

  return mean(values);
}

export class FeatureEncoder {
  encode(buffer: LandmarkFrame[]): EncodedSequence {
    const frames = buffer.slice(-64);
    const dominantHand = pickDominantHand(frames);
    const validFrameCount = frames.filter(
      (frame) =>
        frame.quality.handVisible ||
        frame.quality.faceVisible ||
        frame.quality.poseVisible,
    ).length;
    const handVisibleRatio = safeDivide(
      frames.filter((frame) => Boolean(selectHand(frame, dominantHand))).length,
      frames.length,
    );
    const faceVisibleRatio = safeDivide(
      frames.filter((frame) => Boolean(frame.face)).length,
      frames.length,
    );
    const poseVisibleRatio = safeDivide(
      frames.filter((frame) => Boolean(frame.pose)).length,
      frames.length,
    );
    const recentFrames = frames.slice(-16);
    const occlusionRatio = safeDivide(
      recentFrames.filter(
        (frame) => !selectHand(frame, dominantHand) || !frame.face,
      ).length,
      recentFrames.length,
      1,
    );
    const extractorKind = frames.at(-1)?.quality.extractorKind ?? "mock";
    const isDemoMode = frames.at(-1)?.quality.isDemoMode ?? true;

    const wristSeries: Point3D[] = [];
    const thumbSeries: Point3D[] = [];
    const indexSeries: Point3D[] = [];
    const pinkySeries: Point3D[] = [];
    const mouthOpenSeries: number[] = [];
    const mouthWidthSeries: number[] = [];
    const smileSeries: number[] = [];
    const browLiftSeries: number[] = [];
    const blinkSeries: number[] = [];
    const jawOpenSeries: number[] = [];
    const handOpenSeries: number[] = [];
    const fingerSpreadSeries: number[] = [];
    const handAboveShoulderSeries: number[] = [];
    const handNearFaceSeries: number[] = [];
    const wristDeltaX: number[] = [];
    const wristDeltaY: number[] = [];
    const motionEnergySeries: number[] = [];
    const verticalBiasSeries: number[] = [];
    const validFrameRatio = safeDivide(validFrameCount, frames.length, 0);

    let previousWrist: Point3D | null = null;
    let previousTimestamp = 0;

    for (const frame of frames) {
      const reference = getReference(frame);
      const hand = selectHand(frame, dominantHand);
      const mouth = frame.mouth;

      if (mouth.length >= 4) {
        const upperLip = mouth[0];
        const lowerLip = mouth[1];
        const leftCorner = mouth[2];
        const rightCorner = mouth[3];
        const mouthOpen = safeDivide(
          distance2D(upperLip, lowerLip),
          reference.scale,
          0,
        );
        const mouthWidth = safeDivide(
          distance2D(leftCorner, rightCorner),
          reference.scale,
          0,
        );

        mouthOpenSeries.push(mouthOpen);
        mouthWidthSeries.push(mouthWidth);
        smileSeries.push(
          clamp01(safeDivide(reference.center.y - mean([leftCorner.y, rightCorner.y]), 0.08, 0)),
        );
      }

      browLiftSeries.push(
        clamp01(
          blendshape(frame, ["browInnerUp", "browOuterUpLeft", "browOuterUpRight"]),
        ),
      );
      blinkSeries.push(
        clamp01(
          blendshape(frame, ["eyeBlinkLeft", "eyeBlinkRight", "eyeSquintLeft", "eyeSquintRight"]),
        ),
      );
      jawOpenSeries.push(
        clamp01(
          blendshape(frame, ["jawOpen"], mouthOpenSeries.at(-1) ?? 0),
        ),
      );

      if (!hand?.landmarks.length) {
        previousWrist = null;
        previousTimestamp = frame.timestamp;
        continue;
      }

      const sampled = HAND_SAMPLE_INDICES.map((index) => hand.landmarks[index]);
      const normalized = sampled.map((point) =>
        normalizePoint(point, reference.center, reference.scale, false),
      );
      const wrist = normalized[0];
      const thumb = normalized[1];
      const indexTip = normalized[2];
      const pinky = normalized[4];

      wristSeries.push(wrist);
      thumbSeries.push(thumb);
      indexSeries.push(indexTip);
      pinkySeries.push(pinky);

      handOpenSeries.push(
        clamp01(
          safeDivide(
            mean(sampled.slice(1).map((point) => distance2D(sampled[0], point))),
            reference.scale * 1.4,
            0,
          ),
        ),
      );
      fingerSpreadSeries.push(
        clamp01(
          safeDivide(distance2D(sampled[2], sampled[4]), reference.scale, 0),
        ),
      );
      handAboveShoulderSeries.push(
        clamp01(safeDivide(reference.shoulderY - hand.landmarks[0].y + 0.22, 0.44, 0)),
      );
      handNearFaceSeries.push(
        clamp01(
          1 -
            safeDivide(
              distance2D(hand.landmarks[0], getFaceCenter(frame)),
              reference.scale * 2.2,
              1,
            ),
        ),
      );

      if (previousWrist) {
        const dt = Math.max(frame.timestamp - previousTimestamp, 1);
        const dx = safeDivide(wrist.x - previousWrist.x, dt, 0);
        const dy = safeDivide(wrist.y - previousWrist.y, dt, 0);
        const deltaMagnitude = Math.hypot(dx, dy);

        wristDeltaX.push(dx * 1000);
        wristDeltaY.push(dy * 1000);
        motionEnergySeries.push(clamp01(deltaMagnitude * 48));
        verticalBiasSeries.push(clamp01(Math.abs(dy) / (Math.abs(dx) + Math.abs(dy) + 0.001)));
      }

      previousWrist = wrist;
      previousTimestamp = frame.timestamp;
    }

    const handPoseVector = [
      averagePoint(wristSeries).x,
      averagePoint(wristSeries).y,
      averagePoint(indexSeries).x,
      averagePoint(indexSeries).y,
      averagePoint(thumbSeries).x,
      averagePoint(thumbSeries).y,
      averagePoint(pinkySeries).x,
      averagePoint(pinkySeries).y,
      mean(handOpenSeries),
      mean(fingerSpreadSeries),
      mean(handAboveShoulderSeries),
      mean(handNearFaceSeries),
    ];

    const motionEnergy = mean(motionEnergySeries);
    const mouthStability = deriveMouthStability(mouthOpenSeries);

    const handVelocityVector = [
      mean(wristDeltaX),
      mean(wristDeltaY),
      motionEnergy,
      mean(verticalBiasSeries),
    ];

    const mouthShapeVector = [
      mean(mouthOpenSeries),
      mean(mouthWidthSeries),
      mean(smileSeries),
      mouthStability,
    ];

    const facialCueVector = [
      mean(browLiftSeries),
      mean(blinkSeries),
      mean(smileSeries),
      mean(jawOpenSeries),
    ];

    const motionMaskSummary = [
      validFrameRatio,
      motionEnergy,
      mean(handNearFaceSeries),
      dominantHand === "right" ? 1 : dominantHand === "left" ? 0 : 0.5,
    ];

    const visibilityMask = [
      handVisibleRatio,
      faceVisibleRatio,
      poseVisibleRatio,
      clamp01(1 - occlusionRatio),
    ];

    return {
      handPoseVector,
      handVelocityVector,
      mouthShapeVector,
      facialCueVector,
      motionMaskSummary,
      visibilityMask,
      dominantHand,
      frameCount: validFrameCount,
      centroid: buildCentroid([
        handPoseVector,
        handVelocityVector,
        mouthShapeVector,
        facialCueVector,
        motionMaskSummary,
        visibilityMask,
      ]),
      quality: {
        extractorKind,
        isDemoMode,
        validFrameCount,
        validFrameRatio,
        handVisibleRatio,
        faceVisibleRatio,
        poseVisibleRatio,
        occlusionRatio,
        motionEnergy,
        mouthStability,
      },
    };
  }
}

export const featureEncoder = new FeatureEncoder();
