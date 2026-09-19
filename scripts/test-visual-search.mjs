import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const USER_DATA_DIR = "C:\\Users\\DESKTO~1\\AppData\\Local\\Temp\\edge_visual_search_profile";
const TARGET_URL = "http://localhost:5175/placemend/";

const ARTIFACTS_DIR = "C:\\Users\\Desktop Home\\.gemini\\antigravity\\brain\\f2366a71-5ca5-418d-b7ed-cd9f02875227";

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Building latest code...");
  const build = spawn("cmd.exe", ["/c", "npm", "run", "build"], {
    cwd: "C:\\Users\\Desktop Home\\Workspace\\placemend",
    stdio: 'inherit'
  });
  await new Promise((resolve) => build.on('exit', resolve));

  console.log("Starting preview server on port 5175...");
  const preview = spawn("cmd.exe", ["/c", "npx", "vite", "preview", "--port", "5175"], {
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
    "--remote-debugging-port=9223",
    "about:blank"
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9223/json/version");
      if (res.ok) {
        version = await res.json();
        break;
      }
    } catch (e) {
      await wait(200);
    }
  }

  if (!version) {
    console.error("Could not connect to Edge on port 9223");
    edge.kill();
    preview.kill();
    process.exit(1);
  }

  const newTabRes = await fetch(`http://127.0.0.1:9223/json/new?${encodeURIComponent(TARGET_URL)}`, { method: 'PUT' });
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

  // Reset database to ensure clean fresh demo data
  await send("Runtime.evaluate", {
    expression: `
      new Promise((resolve) => {
        const req = indexedDB.deleteDatabase('PlacemendDB');
        req.onsuccess = resolve;
        req.onerror = resolve;
        req.onblocked = resolve;
      })
    `,
    awaitPromise: true,
  });

  // Emulate Pixel 10 (412 x 915)
  await send("Emulation.setDeviceMetricsOverride", {
    width: 412,
    height: 915,
    deviceScaleFactor: 2.625,
    mobile: true,
  });
  await send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 5,
  });

  // Reload page to seed fresh demo data
  await send("Page.navigate", { url: TARGET_URL });
  await wait(3000);

  async function snap(filename) {
    const ss = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const fullPath = path.join(ARTIFACTS_DIR, filename);
    fs.writeFileSync(fullPath, Buffer.from(ss.data, 'base64'));
    console.log("Saved screenshot:", fullPath);
  }

  // 1. Initial State: Pixel 10 Room Floor Plan
  console.log("Capturing 07_visual_search_initial.png...");
  await snap("07_visual_search_initial.png");

  // 1b. Test 1-FINGER PANNING across the room
  console.log("Testing 1-finger panning (moving across the room with 1 finger)...");
  // Touch down at (200, 500)
  await send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 200, y: 500 }]
  });
  await wait(50);
  // Move 1 finger up and left to (120, 380)
  for (let step = 1; step <= 5; step++) {
    await send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 200 - (80 * step) / 5, y: 500 - (120 * step) / 5 }]
    });
    await wait(30);
  }
  // Lift finger
  await send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: []
  });
  await wait(400);

  console.log("Capturing 07b_one_finger_panned_room.png...");
  await snap("07b_one_finger_panned_room.png");

  // Reset view for search test
  await send("Runtime.evaluate", {
    expression: `window.__STORE__.getState().resetView()`
  });
  await wait(400);

  // 2. Trigger Search for "hdmi"
  console.log("Setting search query to 'hdmi' via store...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        window.__STORE__.getState().setSearchOpen(true);
        window.__STORE__.getState().setSearchQuery('hdmi');
      })()
    `
  });
  await wait(1200);

  // 3. Step 1 of Golden Trail: Room floor plan highlighting Media Console with golden beacon & ⚡ 2 matches badge
  console.log("Capturing 08_step1_room_search_beacon.png...");
  await snap("08_step1_room_search_beacon.png");

  // 4. Step 2 of Golden Trail: Tap glowing Media Console
  console.log("Tapping glowing Media Console (furn-media-console)...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        window.__STORE__.getState().setSelectedFurnitureId('furn-media-console');
      })()
    `
  });
  await wait(1000);

  console.log("Capturing 09_step2_cupboard_drawer_beacon.png...");
  await snap("09_step2_cupboard_drawer_beacon.png");

  // 5. Step 3 of Golden Trail: Tap glowing Left Drawer
  console.log("Tapping glowing Left Drawer (cont-console-d1)...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        window.__STORE__.getState().setSelectedContainerId('cont-console-d1');
      })()
    `
  });
  await wait(1000);

  console.log("Capturing 10_step3_drawer_item_spotlight.png...");
  await snap("10_step3_drawer_item_spotlight.png");

  // 6. Clear search and verify full restore
  console.log("Clearing search...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        window.__STORE__.getState().clearSearch();
      })()
    `
  });
  await wait(800);

  console.log("Capturing 11_search_cleared_restored.png...");
  await snap("11_search_cleared_restored.png");

  // Clean up
  ws.close();
  edge.kill();
  preview.kill();
  console.log("Visual search & 1-finger navigation test complete!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
