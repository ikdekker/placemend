import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const USER_DATA_DIR = "C:\\Users\\DESKTO~1\\AppData\\Local\\Temp\\edge_furnmove_profile";
const TARGET_URL = "http://localhost:5186/placemend/";
const ARTIFACTS_DIR = "C:\\Users\\Desktop Home\\.gemini\\antigravity\\brain\\f2366a71-5ca5-418d-b7ed-cd9f02875227";

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Starting preview server on port 5186...");
  const preview = spawn("cmd.exe", ["/c", "npx", "vite", "preview", "--port", "5186"], {
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

  console.log("Launching Edge with remote debugging on port 9240...");
  const edge = spawn(EDGE_PATH, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--user-data-dir=${USER_DATA_DIR}`,
    "--remote-debugging-port=9240",
    "about:blank"
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9240/json/version");
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

  const newTabRes = await fetch(`http://127.0.0.1:9240/json/new?${encodeURIComponent(TARGET_URL)}`, { method: 'PUT' });
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

  await send("Page.navigate", { url: TARGET_URL });
  await wait(2500);

  async function capture(filename) {
    const res = await send("Page.captureScreenshot", { format: "png" });
    const buf = Buffer.from(res.data, 'base64');
    const outPath = path.join(ARTIFACTS_DIR, filename);
    fs.writeFileSync(outPath, buf);
    console.log(`Saved screenshot: ${filename}`);
  }

  // 1. Switch to Edit Mode and select furniture on floor
  console.log("Switching to Edit Mode on FloorCanvas...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        window.__STORE__.getState().setAppMode('edit');
        window.__STORE__.getState().setSelectedFurnitureId('furn-media-console');
      })()
    `
  });
  await wait(1200);
  console.log("Capturing 42_edit_mode_selected_furniture_on_floor.png...");
  await capture("42_edit_mode_selected_furniture_on_floor.png");

  // 2. Drag / move the furniture piece in the room
  console.log("Simulating moving furniture to a new position (x: 2, y: 6)...");
  await send("Runtime.evaluate", {
    expression: `
      (async () => {
        await window.__DB__.furniture.update('furn-media-console', {
          'position.x': 2,
          'position.y': 6,
          updatedAt: Date.now()
        });
      })()
    `
  });
  await wait(1200);
  console.log("Capturing 43_furniture_moved_to_new_position.png...");
  await capture("43_furniture_moved_to_new_position.png");

  // 3. Rotate the furniture
  console.log("Rotating the furniture 90 degrees...");
  await send("Runtime.evaluate", {
    expression: `
      (async () => {
        const furn = await window.__DB__.furniture.get('furn-media-console');
        const nextRot = ((furn.position.rotation || 0) + 90) % 360;
        await window.__DB__.furniture.update('furn-media-console', {
          'position.rotation': nextRot,
          updatedAt: Date.now()
        });
      })()
    `
  });
  await wait(1200);
  console.log("Capturing 44_furniture_rotated.png...");
  await capture("44_furniture_rotated.png");

  // 4. Switch back to View Mode and open cabinet
  console.log("Switching to View Mode and tapping furniture to open...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        window.__STORE__.getState().setAppMode('view');
        window.__STORE__.getState().setSelectedFurnitureId('furn-media-console');
      })()
    `
  });
  await wait(1200);
  console.log("Capturing 45_view_mode_tap_to_open_cabinet.png...");
  await capture("45_view_mode_tap_to_open_cabinet.png");

  console.log("Cleaning up test...");
  ws.close();
  edge.kill();
  preview.kill();
  process.exit(0);
}

main().catch(console.error);
