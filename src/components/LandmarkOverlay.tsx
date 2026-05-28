"use client";

import { useEffect, useRef } from "react";
import type { LandmarkSnapshot, Point3D } from "@/lib/landmarks/types";

interface LandmarkOverlayProps {
  snapshot: LandmarkSnapshot | null;
  width: number;
  height: number;
  visible: boolean;
}

function drawPoints(
  context: CanvasRenderingContext2D,
  points: Point3D[],
  width: number,
  height: number,
  color: string,
  radius: number,
) {
  context.fillStyle = color;

  for (const point of points) {
    context.beginPath();
    context.arc(point.x * width, point.y * height, radius, 0, Math.PI * 2);
    context.fill();
  }
}

function drawPolyline(
  context: CanvasRenderingContext2D,
  points: Point3D[],
  width: number,
  height: number,
  color: string,
) {
  if (points.length < 2) {
    return;
  }

  context.strokeStyle = color;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(points[0].x * width, points[0].y * height);

  for (const point of points.slice(1)) {
    context.lineTo(point.x * width, point.y * height);
  }

  context.stroke();
}

export default function LandmarkOverlay({
  snapshot,
  width,
  height,
  visible,
}: LandmarkOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.clearRect(0, 0, width, height);

    if (!visible || !snapshot) {
      return;
    }

    drawPoints(context, snapshot.pose?.landmarks.slice(11, 17) ?? [], width, height, "#9fe8ef", 4);
    drawPoints(
      context,
      snapshot.hands.flatMap((hand) => hand.landmarks),
      width,
      height,
      "#ffd37c",
      4,
    );
    drawPolyline(context, snapshot.mouth, width, height, "#ff9a72");
    drawPoints(context, snapshot.mouth, width, height, "#ff9a72", 3);
  }, [snapshot, visible, width, height]);

  return <canvas ref={canvasRef} className="overlay-canvas" aria-hidden="true" />;
}
