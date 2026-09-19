import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const USER_DATA_DIR = "C:\\Users\\DESKTO~1\\AppData\\Local\\Temp\\edge_pixel10_profile";
const TARGET_URL = "http://localhost:5174/placemend/";

const ARTIFACTS_DIR = "C:\\Users\\Desktop Home\\.gemini\\antigravity\\brain\\f2366a71-5ca5-418d-b7ed-cd9f02875227";

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Starting preview server on port 5174...");
  const preview = spawn("cmd.exe", ["/c", "npx", "vite", "preview", "--port", "5174"], {
    cwd: "C:\\Users\\Desktop Home\\Workspace\\placemend",
    stdio: 'ignore'
  });

  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://localhost:5174/placemend/");
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
    "--remote-debugging-port=9222",
    "about:blank"
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9222/json/version");
      if (res.ok) {
        version = await res.json();
        break;
      }
    } catch (e) {
      await wait(200);
    }
  }

  if (!version) {
    console.error("Could not connect to Edge on port 9222");
    edge.kill();
    preview.kill();
    process.exit(1);
  }

  const newTabRes = await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(TARGET_URL)}`, { method: 'PUT' });
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

  // Reset database to ensure new seed with nested compartments loads
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

  // 1. Initial Floor Plan View
  await snap("01_floor_plan_pixel10.png");

  // 2. Click KALLAX bookshelf
  console.log("Tapping KALLAX bookshelf...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        const kallax = document.getElementById('furniture-furn-bookshelf-tall');
        if (kallax) kallax.click();
      })()
    `
  });
  await wait(700);
  await snap("02_kallax_physical_layout.png");

  // 3. Click "Bottom Left DRÖNA Box" (has 2 compartments)
  console.log("Tapping 'Bottom Left DRÖNA Box'...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        const slot = Array.from(document.querySelectorAll('h4')).find(el => el.textContent.includes('DRÖNA Box (Board Games)'));
        if (slot) slot.closest('div[class*="cursor-pointer"]').click();
      })()
    `
  });
  await wait(700);
  await snap("03_box_compartments_zoom.png");

  // 4. Click "Big Box Strategy Games" compartment (deepest level)
  console.log("Tapping 'Big Box Strategy Games' compartment...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        const comp = Array.from(document.querySelectorAll('span')).find(el => el.textContent.includes('Big Box Strategy Games'));
        if (comp) comp.closest('div[class*="cursor-pointer"]').click();
      })()
    `
  });
  await wait(700);
  await snap("04_deepest_level_clean_items.png");

  // 5. Click back to box, back to kallax, and click "Show all items in cupboard"
  console.log("Testing 'Show all items in cupboard'...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        // Click back twice
        const backBtn = document.querySelector('button[title="Back up one level"]');
        if (backBtn) backBtn.click();
      })()
    `
  });
  await wait(400);
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        const backBtn = document.querySelector('button[title="Back up one level"]');
        if (backBtn) backBtn.click();
      })()
    `
  });
  await wait(400);
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        const showAllBtn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Show all items'));
        if (showAllBtn) showAllBtn.click();
      })()
    `
  });
  await wait(700);
  await snap("05_show_all_items_overview.png");

  // Cleanup
  ws.close();
  edge.kill();
  preview.kill();
  console.log("All test steps complete!");
}

main().catch(err => {
  console.error("Test execution error:", err);
  process.exit(1);
});
