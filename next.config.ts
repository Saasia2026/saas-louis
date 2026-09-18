import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

// Adresses IPv4 de la machine sur le réseau local, pour ouvrir le serveur de
// dev depuis un téléphone sur le même Wi-Fi (http://<ip>:3000).
const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((net) => net && net.family === "IPv4" && !net.internal)
  .map((net) => net!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: lanAddresses,
  // ffmpeg-static résout son binaire depuis son propre dossier : il ne doit
  // pas être bundlé, et le binaire doit être embarqué là où on assemble.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/dashboard/generate": ["./node_modules/ffmpeg-static/ffmpeg*"],
    "/api/generate/webhook": ["./node_modules/ffmpeg-static/ffmpeg*"],
  },
};

export default nextConfig;
