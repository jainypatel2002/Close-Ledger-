"use client";

import { motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = Omit<HTMLMotionProps<"button">, "ref"> & {
  glow?: boolean;
};

export const DepthButton = forwardRef<HTMLButtonElement, Props>(function DepthButton(
  { className, glow = true, children, disabled, ...props },
  ref
) {
  return (
    <motion.button
      ref={ref}
      whileHover={{ y: -1, scale: 1.01 }}
      whileTap={{ y: 1, scale: 0.995 }}
      transition={{ duration: 0.14 }}
      disabled={disabled}
      className={cn(
        "relative overflow-hidden rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white transition",
        "bg-gradient-to-br from-brand-crimson/95 via-red-700 to-brand-ember shadow-depth",
        "disabled:pointer-events-none disabled:opacity-50",
        glow && "shadow-glow",
        className
      )}
      {...props}
    >
      <span className="relative z-10">{children as ReactNode}</span>
      <span
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.32),transparent_42%)] opacity-70"
        aria-hidden
      />
    </motion.button>
  );
});
