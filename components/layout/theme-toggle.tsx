"use client";

import { useTheme } from "next-themes";

export const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();
  const isDark = theme !== "standard";

  return (
    <button
      type="button"
      className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/85 hover:bg-white/10"
      onClick={() => setTheme(isDark ? "standard" : "dark")}
    >
      {isDark ? "Standard Theme" : "Dark Theme"}
    </button>
  );
};
