import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const USER_DATA_DIR = "C:\\Users\\DESKTO~1\\AppData\\Local\\Temp\\edge_interactables_profile";
const TARGET_URL = "http://localhost:5179/placemend/";

const ARTIFACTS_DIR = "C:\\Users\\Desktop Home\\.gemini\\antigravity\\brain\\f2366a71-5ca5-418d-b7ed-cd9f02875227";

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Starting preview server on port 5179...");
  const preview = spawn("cmd.exe", ["/c", "npx", "vite", "preview", "--port", "5179"], {
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

  console.log("Launching Edge with remote debugging on port 9227...");
  const edge = spawn(EDGE_PATH, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--user-data-dir=${USER_DATA_DIR}`,
    "--remote-debugging-port=9227",
    "about:blank"
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9227/json/version");
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

  const newTabRes = await fetch(`http://127.0.0.1:9227/json/new?${encodeURIComponent(TARGET_URL)}`, { method: 'PUT' });
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

  // 1. Open Media Console Cabinet to view Enlarged Cabinet Facade & Drawers
  console.log("Opening Media Console Cabinet...");
  await send("Runtime.evaluate", {
    expression: `window.__STORE__.getState().setSelectedFurnitureId('furn-media-console')`
  });
  await wait(1500);
  console.log("Capturing 28_enlarged_cabinet_facade_pixel10.png...");
  await capture("28_enlarged_cabinet_facade_pixel10.png");

  // 2. Open Layout Composer to view Enlarged Composer Controls
  console.log("Entering Compose Layout mode...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const layoutBtn = btns.find(b => b.textContent && b.textContent.includes('Layout'));
        if (layoutBtn) layoutBtn.click();
      })()
    `
  });
  await wait(1200);
  console.log("Capturing 29_enlarged_composer_controls.png...");
  await capture("29_enlarged_composer_controls.png");

  // 3. Exit Compose Mode
  console.log("Clicking Done...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const doneBtn = btns.find(b => b.textContent && b.textContent.trim() === 'Done');
        if (doneBtn) doneBtn.click();
      })()
    `
  });
  await wait(1000);

  // 4. Open drawer interior to verify enlarged item cards & icons
  console.log("Opening a drawer interior...");
  await send("Runtime.evaluate", {
    expression: `
      (async () => {
        window.__STORE__.getState().setSelectedFurnitureId('furn-media-console');
        const conts = await window.__DB__.containers.where('furnitureId').equals('furn-media-console').toArray();
        if (conts.length > 0) {
          window.__STORE__.getState().setSelectedContainerId(conts[0].id);
        }
      })()
    `,
    awaitPromise: true
  });
  await wait(1500);
  console.log("Capturing 30_enlarged_drawer_interior_pixel10.png...");
  await capture("30_enlarged_drawer_interior_pixel10.png");

  console.log("Cleaning up...");
  ws.close();
  edge.kill();
  preview.kill();
  process.exit(0);
}

main().catch(console.error);
