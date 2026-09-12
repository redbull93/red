"use client";

import { cn } from "@/lib/utils";

export interface KineticTextLoaderProps
  extends React.HTMLAttributes<HTMLDivElement> {
  text?: string;
}

/** Vengeance UI — kinetic-text-loader (registry: @vengeanceui/kinetic-text-loader) */
export function KineticTextLoader({
  className,
  text = "CONTROL",
  ...props
}: KineticTextLoaderProps) {
  const letters = text.split("");

  return (
    <div
      className={cn(
        "kinetic-loader flex items-end gap-[0.12em] font-display text-3xl tracking-[0.18em] text-white",
        className,
      )}
      {...props}
    >
      {letters.map((char, index) => (
        <span
          key={`${char}-${index}`}
          className="kinetic-letter inline-block origin-bottom"
          style={{ animationDelay: `${index * 80}ms` }}
        >
          {char === " " ? "\u00a0" : char}
        </span>
      ))}
    </div>
  );
}

export default KineticTextLoader;
