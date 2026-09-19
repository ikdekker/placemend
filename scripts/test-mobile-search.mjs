import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const USER_DATA_DIR = "C:\\Users\\DESKTO~1\\AppData\\Local\\Temp\\edge_mobilesearch_profile";
const TARGET_URL = "http://localhost:5180/placemend/";

const ARTIFACTS_DIR = "C:\\Users\\Desktop Home\\.gemini\\antigravity\\brain\\f2366a71-5ca5-418d-b7ed-cd9f02875227";

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Starting preview server on port 5180...");
  const preview = spawn("cmd.exe", ["/c", "npx", "vite", "preview", "--port", "5180"], {
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

  console.log("Launching Edge with remote debugging on port 9228...");
  const edge = spawn(EDGE_PATH, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--user-data-dir=${USER_DATA_DIR}`,
    "--remote-debugging-port=9228",
    "about:blank"
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9228/json/version");
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

  const newTabRes = await fetch(`http://127.0.0.1:9228/json/new?${encodeURIComponent(TARGET_URL)}`, { method: 'PUT' });
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

  await send("Page.navigate", { url: TARGET_URL });
  await wait(2500);

  async function capture(filename) {
    const res = await send("Page.captureScreenshot", { format: "png" });
    const buf = Buffer.from(res.data, 'base64');
    const outPath = path.join(ARTIFACTS_DIR, filename);
    fs.writeFileSync(outPath, buf);
    console.log(`Saved screenshot: ${filename}`);
  }

  // 1. Open Mobile Search Sheet
  console.log("Opening Mobile Search Sheet...");
  await send("Runtime.evaluate", {
    expression: `window.__STORE__.getState().setSearchOpen(true)`
  });
  await wait(1200);
  console.log("Capturing 31_mobile_search_sheet_empty.png...");
  await capture("31_mobile_search_sheet_empty.png");

  // 2. Click the '🔌 Cables' Quick Filter Chip
  console.log("Clicking Cables filter chip...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const chip = btns.find(b => b.textContent && b.textContent.includes('Cables'));
        if (chip) chip.click();
      })()
    `
  });
  await wait(1500);
  console.log("Capturing 32_mobile_search_results_cables.png...");
  await capture("32_mobile_search_results_cables.png");

  // 3. Search for broad term matching multiple rooms to see Room Filter Tabs
  console.log("Searching for 'a' to see multi-room tabs...");
  await send("Runtime.evaluate", {
    expression: `window.__STORE__.getState().setSearchQuery('a')`
  });
  await wait(1500);
  console.log("Capturing 33_mobile_search_room_tabs.png...");
  await capture("33_mobile_search_room_tabs.png");

  // 4. Test 1-Tap Direct Locate: Search for 'velcro' and tap result
  console.log("Searching for 'velcro' and clicking Locate...");
  await send("Runtime.evaluate", {
    expression: `window.__STORE__.getState().setSearchQuery('velcro')`
  });
  await wait(1000);
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        // Find the item card
        const itemCard = document.querySelector('[data-testid="search-result-card"]');
        if (itemCard) itemCard.click();
      })()
    `
  });
  await wait(2000);
  console.log("Capturing 34_direct_locate_drawer_spotlight.png...");
  await capture("34_direct_locate_drawer_spotlight.png");

  // 5. Navigate to Floor Plan to see Visual Search Beacon & Floating Banner
  console.log("Navigating to room floor plan with search active...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        window.__STORE__.getState().setSelectedFurnitureId(null);
        window.__STORE__.getState().setSelectedContainerId(null);
      })()
    `
  });
  await wait(1500);
  console.log("Capturing 35_floorplan_visual_search_beacon.png...");
  await capture("35_floorplan_visual_search_beacon.png");

  // 6. Clear search
  console.log("Clearing search...");
  await send("Runtime.evaluate", {
    expression: `window.__STORE__.getState().clearSearch()`
  });
  await wait(1000);
  console.log("Capturing 36_search_cleared_clean_room.png...");
  await capture("36_search_cleared_clean_room.png");

  console.log("Cleaning up...");
  ws.close();
  edge.kill();
  preview.kill();
  process.exit(0);
}

main().catch(console.error);
