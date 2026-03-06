import { cn } from "@/lib/utils";

export const Badge = ({
  label,
  variant = "default",
  className
}: {
  label: string;
  variant?: "default" | "admin" | "staff" | "success" | "warn";
  className?: string;
}) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
      variant === "default" && "border-white/20 bg-white/10 text-white",
      variant === "admin" && "border-red-300/30 bg-red-500/20 text-red-100",
      variant === "staff" && "border-blue-300/30 bg-blue-500/20 text-blue-100",
      variant === "success" && "border-green-300/30 bg-green-500/20 text-green-100",
      variant === "warn" && "border-amber-300/30 bg-amber-500/20 text-amber-100",
      className
    )}
  >
    {label}
  </span>
);
