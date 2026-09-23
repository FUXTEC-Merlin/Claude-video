/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "1024mb"
    },
    // Native binaries (ffmpeg-static/ffprobe-static) must be required at
    // runtime from node_modules, not bundled — bundling breaks their paths.
    serverComponentsExternalPackages: ["fluent-ffmpeg", "ffmpeg-static", "ffprobe-static"]
  }
};

module.exports = nextConfig;
