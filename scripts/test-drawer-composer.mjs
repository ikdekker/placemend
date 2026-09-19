import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const USER_DATA_DIR = "C:\\Users\\DESKTO~1\\AppData\\Local\\Temp\\edge_composer_profile";
const TARGET_URL = "http://localhost:5178/placemend/";

const ARTIFACTS_DIR = "C:\\Users\\Desktop Home\\.gemini\\antigravity\\brain\\f2366a71-5ca5-418d-b7ed-cd9f02875227";

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Starting preview server on port 5178...");
  const preview = spawn("cmd.exe", ["/c", "npx", "vite", "preview", "--port", "5178"], {
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

  console.log("Launching Edge with remote debugging on port 9226...");
  const edge = spawn(EDGE_PATH, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--user-data-dir=${USER_DATA_DIR}`,
    "--remote-debugging-port=9226",
    "about:blank"
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9226/json/version");
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

  const newTabRes = await fetch(`http://127.0.0.1:9226/json/new?${encodeURIComponent(TARGET_URL)}`, { method: 'PUT' });
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

  // 1. Open Media Console Cabinet to view Pure Visual Facade (ZERO TEXT on drawer faces)
  console.log("Opening Media Console Cabinet...");
  await send("Runtime.evaluate", {
    expression: `window.__STORE__.getState().setSelectedFurnitureId('furn-media-console')`
  });
  await wait(1500);
  console.log("Capturing 23_pure_visual_facade_no_text.png...");
  await capture("23_pure_visual_facade_no_text.png");

  // Check that no drawer front contains text like "Left Drawer" or "Middle Drawer"
  const drawerTexts = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const cabinet = document.querySelector('.shadow-2xl');
        if (!cabinet) return [];
        return Array.from(cabinet.querySelectorAll('h3, span, p')).map(e => e.textContent.trim());
      })()
    `,
    returnByValue: true
  });
  console.log("Drawer face texts in pure visual mode (should have zero text labels):", drawerTexts.value);

  // 2. Click "Layout" button to enter Interactive Compose Mode
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
  console.log("Capturing 24_composer_mode_active.png...");
  await capture("24_composer_mode_active.png");

  // 3. Apply the "2 Left, 2 Mid, 1 Right" preset
  console.log("Applying '2 Left, 2 Mid, 1 Right' preset...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const presetBtn = btns.find(b => b.textContent && b.textContent.includes('2 Left, 2 Mid, 1 Right'));
        if (presetBtn) presetBtn.click();
      })()
    `
  });
  await wait(1500);
  console.log("Capturing 25_composer_2_left_2_mid_1_right.png...");
  await capture("25_composer_2_left_2_mid_1_right.png");

  // 4. Click "Done" to exit compose mode into the composed Pure Visual Facade
  console.log("Clicking Done to exit compose mode...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const doneBtn = btns.find(b => b.textContent && b.textContent.trim() === 'Done');
        if (doneBtn) doneBtn.click();
      })()
    `
  });
  await wait(1500);
  console.log("Capturing 26_composed_facade_pure_visual.png...");
  await capture("26_composed_facade_pure_visual.png");

  // 5. Test search highlighting in the composed layout (searching for 'hdmi')
  console.log("Searching for 'hdmi' in composed layout...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        window.__STORE__.getState().setSearchOpen(true);
        window.__STORE__.getState().setSearchQuery('hdmi');
      })()
    `
  });
  await wait(1500);
  console.log("Capturing 27_composed_facade_search_beacon.png...");
  await capture("27_composed_facade_search_beacon.png");

  console.log("Cleaning up...");
  ws.close();
  edge.kill();
  preview.kill();
  process.exit(0);
}

main().catch(console.error);
