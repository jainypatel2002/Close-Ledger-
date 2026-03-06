import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "ui-sans-serif", "system-ui"],
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular"]
      },
      colors: {
        base: {
          50: "#f8f9fa",
          100: "#f1f3f5",
          900: "#0b0b0d",
          950: "#050507"
        },
        brand: {
          crimson: "#dc143c",
          ember: "#ff4f2e",
          ink: "#111217"
        }
      },
      boxShadow: {
        depth: "0 12px 30px rgba(0, 0, 0, 0.3)",
        glow: "0 0 0 1px rgba(220,20,60,0.35), 0 10px 24px rgba(220,20,60,0.22)"
      },
      backgroundImage: {
        "brand-gradient":
          "radial-gradient(circle at 20% 20%, rgba(220,20,60,0.25), transparent 40%), radial-gradient(circle at 80% 0%, rgba(255,79,46,0.18), transparent 38%), linear-gradient(160deg, #060608 20%, #10111a 60%, #161621 100%)"
      }
    }
  },
  darkMode: "class",
  plugins: []
};

export default config;
