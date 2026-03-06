"use client";

import { motion, useMotionTemplate, useMotionValue } from "framer-motion";
import { ReactNode, useMemo } from "react";
import { cn } from "@/lib/utils";

interface TiltCardProps {
  children: ReactNode;
  className?: string;
}

export const TiltCard = ({ children, className }: TiltCardProps) => {
  const x = useMotionValue(50);
  const y = useMotionValue(50);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const background = useMotionTemplate`radial-gradient(circle at ${x}% ${y}%, rgba(220,20,60,0.18), rgba(255,255,255,0.02) 36%, rgba(0,0,0,0.26))`;

  const isTouch = useMemo(
    () => typeof window !== "undefined" && "ontouchstart" in window,
    []
  );

  return (
    <motion.div
      className={cn(
        "relative rounded-2xl border border-white/10 bg-black/35 p-4 shadow-depth backdrop-blur-sm",
        className
      )}
      style={{
        rotateX,
        rotateY,
        transformStyle: "preserve-3d"
      }}
      onPointerMove={(event) => {
        if (isTouch) {
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const px = ((event.clientX - rect.left) / rect.width) * 100;
        const py = ((event.clientY - rect.top) / rect.height) * 100;
        x.set(px);
        y.set(py);
        rotateX.set(((py - 50) / 50) * -5);
        rotateY.set(((px - 50) / 50) * 5);
      }}
      onPointerLeave={() => {
        rotateX.set(0);
        rotateY.set(0);
        x.set(50);
        y.set(50);
      }}
    >
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{ background }}
        aria-hidden
      />
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
};
