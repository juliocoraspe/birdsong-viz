import { defineConfig } from "vite";
import fs from "fs";

function httpsIfAvailable() {
  try {
    const key = fs.readFileSync("./localhost-key.pem");
    const cert = fs.readFileSync("./localhost.pem");
    return { key, cert };
  } catch {
    return undefined;
  }
}

export default defineConfig({
  server: {
    https: httpsIfAvailable(),
    host: true,
    port: 5173,
  },
  preview: {
    https: httpsIfAvailable(),
    host: true,
    port: 5174,
  },
});
