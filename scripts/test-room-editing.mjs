import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const USER_DATA_DIR = "C:\\Users\\DESKTO~1\\AppData\\Local\\Temp\\edge_roomedit_profile2";
const TARGET_URL = "http://localhost:5190/placemend/";
const ARTIFACTS_DIR = "C:\\Users\\Desktop Home\\.gemini\\antigravity\\brain\\f2366a71-5ca5-418d-b7ed-cd9f02875227";

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Starting preview server on port 5190...");
  const preview = spawn("cmd.exe", ["/c", "npx", "vite", "preview", "--port", "5190"], {
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

  console.log("Launching Edge with remote debugging on port 9250...");
  const edge = spawn(EDGE_PATH, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--user-data-dir=${USER_DATA_DIR}`,
    "--remote-debugging-port=9250",
    "about:blank"
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9250/json/version");
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

  const newTabRes = await fetch(`http://127.0.0.1:9250/json/new?${encodeURIComponent(TARGET_URL)}`, { method: 'PUT' });
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

  // 1. Enter Edit Mode and open Room Architecture Modal (Door tab) to capture the revamped blueprint & controls
  console.log("Opening Door & Entrance tab with live blueprint and separate width/distance controls...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        window.__STORE__.getState().setAppMode('edit');
        window.__STORE__.getState().setSelectedRoomId('room-living');
        window.__STORE__.getState().setRoomShapeModalOpen(true, 'door');
      })()
    `
  });
  await wait(1200);
  console.log("Capturing 51_revamped_door_tab_blueprint.png...");
  await capture("51_revamped_door_tab_blueprint.png");

  // 2. Close modal and capture clean on-canvas Door badge
  console.log("Closing modal and inspecting clean on-canvas Door badge...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        window.__STORE__.getState().setRoomShapeModalOpen(false);
        window.__STORE__.getState().resetView();
      })()
    `
  });
  await wait(1200);
  console.log("Capturing 54_clean_canvas_door_badge.png...");
  await capture("54_clean_canvas_door_badge.png");

  // 3. Test Mirror Horizontally (Flip Left ↔ Right)
  console.log("Triggering Mirror Horizontally (Flip Left ↔ Right)...");
  await send("Runtime.evaluate", {
    expression: `
      (async () => {
        const mirrorBtn = Array.from(document.querySelectorAll('button')).find(b => b.title && b.title.includes('Mirror Horizontally'));
        if (mirrorBtn) {
          mirrorBtn.click();
        }
      })()
    `
  });
  await wait(1500);
  await send("Runtime.evaluate", {
    expression: `(() => window.__STORE__.getState().resetView())()`
  });
  await wait(1000);
  console.log("Capturing 52_room_mirrored_horizontal.png...");
  await capture("52_room_mirrored_horizontal.png");

  // 4. Test Mirror Vertically (Flip Top ↕ Bottom)
  console.log("Triggering Mirror Vertically (Flip Top ↕ Bottom)...");
  await send("Runtime.evaluate", {
    expression: `
      (async () => {
        const mirrorVertBtn = Array.from(document.querySelectorAll('button')).find(b => b.title && b.title.includes('Mirror Vertically'));
        if (mirrorVertBtn) {
          mirrorVertBtn.click();
        }
      })()
    `
  });
  await wait(1500);
  await send("Runtime.evaluate", {
    expression: `(() => window.__STORE__.getState().resetView())()`
  });
  await wait(1000);
  console.log("Capturing 53_room_mirrored_vertical.png...");
  await capture("53_room_mirrored_vertical.png");

  console.log("All mirror & door verification tests complete!");
  ws.close();
  preview.kill();
  edge.kill();
  process.exit(0);
}

main().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
