"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface GlowBorderCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  colorPreset?: "nature" | "ocean" | "sunset" | "aurora" | "custom";
  paused?: boolean;
  width?: string | number;
  inset?: string;
  borderWidth?: string;
  blurAmount?: string;
}

const colorPresets: Record<string, string[]> = {
  nature: ["#88bb22", "#99cc33", "#3399cc", "#669900"],
  ocean: ["#1177aa", "#44aadd", "#66ccff", "#006699"],
  sunset: ["#ff7711", "#ffaa22", "#ffcc00", "#ff6600"],
  aurora: ["#00ff87", "#60efff", "#bb99ff", "#ff68f0"],
  custom: ["#99cc33", "#3399cc", "#cc3399", "#ff9900"],
};

/** Vengeance UI — glow-border-card, sized for dense mission-control panels. */
export const GlowBorderCard = React.forwardRef<
  HTMLDivElement,
  GlowBorderCardProps
>(
  (
    {
      children,
      className,
      colorPreset = "aurora",
      paused = false,
      width,
      inset,
      borderWidth,
      blurAmount,
      style,
      ...props
    },
    ref,
  ) => {
    const colors = colorPresets[colorPreset] ?? colorPresets.custom;
    const colorVars: Record<string, string> = {};
    colors.forEach((color, i) => {
      colorVars[`--glow-color-${i + 1}`] = color;
    });

    return (
      <div
        ref={ref}
        className={cn(
          "relative isolate overflow-hidden rounded-2xl p-px",
          className,
        )}
        style={{ ...(width ? { width } : {}), ...colorVars, ...style } as React.CSSProperties}
        {...props}
      >
        <div
          className={cn(
            "glow-edge pointer-events-none absolute inset-[-1px] -z-10 rounded-[inherit]",
            paused && "[animation-play-state:paused]",
          )}
          style={{
            ...(inset ? { inset } : {}),
            ...(borderWidth ? { borderWidth } : {}),
            ...(blurAmount ? { filter: `blur(${blurAmount})` } : {}),
          }}
        />
        <div className="relative z-10 h-full rounded-[calc(1rem-1px)] bg-[#0b0b10]/92 p-4 backdrop-blur-md">
          {children}
        </div>
      </div>
    );
  },
);

GlowBorderCard.displayName = "GlowBorderCard";
export default GlowBorderCard;
