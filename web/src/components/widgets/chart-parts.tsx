"use client";

import * as React from "react";
import { motion, useSpring, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

/* Small pieces shared by the chart widgets (the prediction market). */

const CHART_HEIGHT = 200;
const SKELETON_LINE = [62, 58, 64, 55, 49, 53, 44, 47, 40, 45, 38, 33, 37, 30, 34, 27, 31, 24, 28, 22];

/** A chart-shaped loading placeholder: faint gridlines and a shimmering area silhouette. */
export function ChartShimmer({ height = CHART_HEIGHT, className }: { height?: number; className?: string }) {
  const step = 100 / (SKELETON_LINE.length - 1);
  const line = SKELETON_LINE.map((y, i) => `${(i * step).toFixed(2)}% ${y}%`).join(", ");
  const band = [
    ...SKELETON_LINE.map((y, i) => `${(i * step).toFixed(2)}% ${y - 1.2}%`),
    ...SKELETON_LINE.map((y, i) => `${(100 - i * step).toFixed(2)}% ${SKELETON_LINE[SKELETON_LINE.length - 1 - i] + 1.2}%`),
  ].join(", ");
  return (
    <div className={cn("relative overflow-hidden rounded-xl", className)} style={{ height }} aria-hidden>
      {[0.25, 0.5, 0.75].map((f) => (
        <div key={f} className="absolute inset-x-0 border-t border-dashed border-border" style={{ top: `${f * 100}%` }} />
      ))}
      <div className="shimmer absolute inset-0 opacity-50" style={{ clipPath: `polygon(${line}, 100% 100%, 0% 100%)` }} />
      <div className="shimmer absolute inset-0" style={{ clipPath: `polygon(${band})` }} />
    </div>
  );
}

/**
 * A number that glides to new values (a short spring) and snaps instantly when `instant` is set,
 * for example while a chart hover is driving it.
 */
export function Ticker({
  value,
  format,
  instant,
  className,
}: {
  value: number;
  format: (v: number) => string;
  instant?: boolean;
  className?: string;
}) {
  const spring = useSpring(value, { stiffness: 170, damping: 26, mass: 0.7 });
  const formatRef = React.useRef(format);
  React.useEffect(() => {
    formatRef.current = format;
  }, [format]);
  React.useEffect(() => {
    if (instant) spring.jump(value);
    else spring.set(value);
  }, [value, instant, spring]);
  const text = useTransform(spring, (v) => formatRef.current(v));
  return <motion.span className={cn("nums", className)}>{text}</motion.span>;
}

export function ChartTip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-w-28 flex-col gap-1 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[0.76rem] text-popover-foreground shadow-float">
      {children}
    </div>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[0.85rem] text-muted-foreground">
      {children}
    </p>
  );
}

export function formatTime(t: number, span: number, timeZone?: string, long = false): string {
  const d = new Date(t);
  try {
    if (span <= 2 * 86_400_000) {
      const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
      return long && timeZone === "America/New_York" ? `${time} ET` : time;
    }
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      ...(long || span > 400 * 86_400_000 ? { year: "numeric" } : {}),
      timeZone,
    });
  } catch {
    return d.toISOString().slice(11, 16);
  }
}

const TICK_STEPS = [
  5, 15, 30, 60, 120, 180, 360, 720, 1440, 2 * 1440, 7 * 1440, 14 * 1440, 30 * 1440, 91 * 1440, 182 * 1440, 365 * 1440,
].map((m) => m * 60_000);

/** A few evenly spaced, round ticks (on the hour, on the day) between `from` and `to`. */
export function timeTicks(from: number, to: number, max: number): number[] {
  const span = to - from;
  if (!(span > 0)) return [from];
  const step = TICK_STEPS.find((s) => span / s <= max) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const ticks: number[] = [];
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) {
    if (t - from > span * 0.04 && to - t > span * 0.04) ticks.push(t);
  }
  return ticks.length ? ticks : [from + span / 2];
}
