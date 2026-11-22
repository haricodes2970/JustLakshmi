import type { MetadataRoute } from "next";
import { PRODUCT } from "@/config/product";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: PRODUCT.displayName,
    short_name: PRODUCT.displayName,
    description: PRODUCT.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["productivity", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
