import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const USER_DATA_DIR = "C:\\Users\\DESKTO~1\\AppData\\Local\\Temp\\edge_semi3d_profile";
const TARGET_URL = "http://localhost:5177/placemend/";

const ARTIFACTS_DIR = "C:\\Users\\Desktop Home\\.gemini\\antigravity\\brain\\f2366a71-5ca5-418d-b7ed-cd9f02875227";

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Starting preview server on port 5177...");
  const preview = spawn("cmd.exe", ["/c", "npx", "vite", "preview", "--port", "5177"], {
    cwd: "C:\\Users\\Desktop Home\\Workspace\\placemend",
    stdio: 'ignore'
  });

  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(TARGET_URL);
      if (res.ok) break;
    } catch (e) {
      await wait(200);
    }
  }

  console.log("Launching Edge with remote debugging...");
  const edge = spawn(EDGE_PATH, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--user-data-dir=${USER_DATA_DIR}`,
    "--remote-debugging-port=9225",
    "about:blank"
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9225/json/version");
      if (res.ok) {
        version = await res.json();
        break;
      }
    } catch (e) {
      await wait(200);
    }
  }

  if (!version) {
    console.error("Failed to connect to Edge CDP");
    preview.kill();
    edge.kill();
    process.exit(1);
  }

  const newTabRes = await fetch(`http://127.0.0.1:9225/json/new?${encodeURIComponent(TARGET_URL)}`, { method: 'PUT' });
  const tab = await newTabRes.json();

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 1;
  const callbacks = new Map();

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const reqId = id++;
      callbacks.set(reqId, { resolve, reject });
      ws.send(JSON.stringify({ id: reqId, method, params }));
    });
  }

  await new Promise((resolve) => ws.onopen = resolve);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && callbacks.has(msg.id)) {
      const { resolve, reject } = callbacks.get(msg.id);
      callbacks.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  };

  await send("Page.enable");
  await send("Runtime.enable");

  console.log("Setting device emulation: Pixel 10 (412x915, mobile: true)...");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 412,
    height: 915,
    deviceScaleFactor: 2.625,
    mobile: true,
    hasTouch: true
  });

  await send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 5
  });

  // Navigate and wait for page to render
  await send("Page.navigate", { url: TARGET_URL });
  await wait(2500);

  // Helper function to capture screenshot
  async function capture(filename) {
    const res = await send("Page.captureScreenshot", { format: "png" });
    const buf = Buffer.from(res.data, 'base64');
    const outPath = path.join(ARTIFACTS_DIR, filename);
    fs.writeFileSync(outPath, buf);
    console.log(`Saved screenshot: ${filename}`);
  }

  // 1. Initial room view: shows furniture badge counts
  console.log("Capturing 18_room_view_pixel10.png...");
  await capture("18_room_view_pixel10.png");

  // 2. Open Media Console Cabinet to view the Semi-3D Physical Furniture Facade
  console.log("Opening Media Console Cabinet to view Semi-3D Facade...");
  await send("Runtime.evaluate", {
    expression: `window.__STORE__.getState().setSelectedFurnitureId('furn-media-console')`
  });
  await wait(1500);
  console.log("Capturing 19_semi3d_console_facade.png...");
  await capture("19_semi3d_console_facade.png");

  // 3. Open Left Drawer
  console.log("Opening Left Drawer to view interior...");
  await send("Runtime.evaluate", {
    expression: `window.__STORE__.getState().setSelectedContainerId('cont-console-d1')`
  });
  await wait(1500);
  console.log("Capturing 20_drawer_interior_clean.png...");
  await capture("20_drawer_interior_clean.png");

  // 4. Test Visual Search in the Semi-3D Facade
  console.log("Stepping back to cabinet view and searching for 'hdmi'...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        window.__STORE__.getState().setSelectedContainerId(null);
        window.__STORE__.getState().setSearchOpen(true);
        window.__STORE__.getState().setSearchQuery('hdmi');
      })()
    `
  });
  await wait(1500);
  console.log("Capturing 21_semi3d_search_beacon_left_drawer.png...");
  await capture("21_semi3d_search_beacon_left_drawer.png");

  // 5. Test Real Photo Simulation on the furniture
  console.log("Simulating furniture photo upload...");
  // Create a minimal svg base64 data url for realistic photo demonstration
  const samplePhotoSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%231e293b"/><stop offset="100%" stop-color="%230f172a"/></linearGradient></defs><rect width="600" height="400" fill="url(%23g)"/><rect x="60" y="140" width="480" height="180" rx="12" fill="%230f766e" stroke="%2314b8a6" stroke-width="4"/><rect x="80" y="160" width="130" height="140" rx="8" fill="%230d9488"/><rect x="235" y="160" width="130" height="140" rx="8" fill="%230d9488"/><rect x="390" y="160" width="130" height="140" rx="8" fill="%230d9488"/><rect x="120" y="220" width="50" height="8" rx="4" fill="%23ccfbf1"/><rect x="275" y="220" width="50" height="8" rx="4" fill="%23ccfbf1"/><rect x="430" y="220" width="50" height="8" rx="4" fill="%23ccfbf1"/><text x="300" y="80" fill="%23e2e8f0" font-family="sans-serif" font-size="22" font-weight="bold" text-anchor="middle">Living Room TV &amp; Media Console</text></svg>`;

  await send("Runtime.evaluate", {
    expression: `
      (async () => {
        window.__STORE__.getState().clearSearch();
        await window.__DB__.furniture.update('furn-media-console', {
          photoDataUrl: ${JSON.stringify(samplePhotoSvg)}
        });
      })()
    `
  });
  await wait(1500);

  // Click the photo toggle button to view photo mode
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Photo'));
        if (btn) btn.click();
      })()
    `
  });
  await wait(1500);
  console.log("Capturing 22_real_photo_view_mode.png...");
  await capture("22_real_photo_view_mode.png");

  console.log("Cleaning up...");
  ws.close();
  edge.kill();
  preview.kill();
  process.exit(0);
}

main().catch(console.error);
