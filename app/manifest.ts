import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nightly Closing",
    short_name: "Closing",
    description: "Offline-first multi-store nightly closing app",
    start_url: "/",
    display: "standalone",
    background_color: "#050507",
    theme_color: "#111217",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml"
      },
      {
        src: "/icons/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable"
      }
    ]
  };
}
