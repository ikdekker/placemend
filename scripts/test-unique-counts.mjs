import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const USER_DATA_DIR = "C:\\Users\\DESKTO~1\\AppData\\Local\\Temp\\edge_unique_counts_profile";
const TARGET_URL = "http://localhost:5176/placemend/";

const ARTIFACTS_DIR = "C:\\Users\\Desktop Home\\.gemini\\antigravity\\brain\\f2366a71-5ca5-418d-b7ed-cd9f02875227";

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Starting preview server on port 5176...");
  const preview = spawn("cmd.exe", ["/c", "npx", "vite", "preview", "--port", "5176"], {
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
    "--remote-debugging-port=9224",
    "about:blank"
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9224/json/version");
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

  const newTabRes = await fetch(`http://127.0.0.1:9224/json/new?${encodeURIComponent(TARGET_URL)}`, { method: 'PUT' });
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
  await capture("12_room_view_unique_counts.png");

  // Open Media Console Cabinet to open PhysicalFurnitureView
  console.log("Opening Media Console Cabinet...");
  await send("Runtime.evaluate", {
    expression: `window.__STORE__.getState().setSelectedFurnitureId('furn-media-console')`
  });
  await wait(1500);

  // 2. Cupboard view showing drawer badges
  await capture("13_cupboard_unique_counts.png");

  // Open Left Drawer to see the items inside
  console.log("Opening Left Drawer...");
  await send("Runtime.evaluate", {
    expression: `window.__STORE__.getState().setSelectedContainerId('cont-console-d1')`
  });
  await wait(1500);

  // 3. Drawer interior view: shows unique item cards
  await capture("14_drawer_interior_unique_counts.png");

  // 4. Test search for "straps" to verify match count is 1 (unique matching item) instead of 20
  console.log("Typing 'straps' into search...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        window.__STORE__.getState().setSearchOpen(true);
        window.__STORE__.getState().setSearchQuery('straps');
      })()
    `
  });
  await wait(1500);

  // 5. Capture search result
  await capture("15_search_straps_1_match.png");

  // 6. Step back to cupboard view during search to verify drawer badge shows ⚡ 1 match
  console.log("Stepping back to cupboard view during search...");
  await send("Runtime.evaluate", {
    expression: `window.__STORE__.getState().setSelectedContainerId(null)`
  });
  await wait(1200);
  await capture("16_cupboard_search_straps_1_match.png");

  // 7. Step back to room view during search to verify console shows ⚡ 1 match
  console.log("Stepping back to room view during search...");
  await send("Runtime.evaluate", {
    expression: `window.__STORE__.getState().setSelectedFurnitureId(null)`
  });
  await wait(1200);
  await capture("17_room_search_straps_1_match.png");

  console.log("Cleaning up...");
  ws.close();
  edge.kill();
  preview.kill();
  process.exit(0);
}

main().catch(console.error);
