import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const USER_DATA_DIR = "C:\\Users\\DESKTO~1\\AppData\\Local\\Temp\\edge_scroll_test_profile";
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

  // Reset database to ensure new seed with full items catalog loads
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

  // Navigate to target
  await send("Page.navigate", { url: TARGET_URL });
  await wait(3000);

  // Click Media Console Cabinet (which has 6 items in Left Drawer)
  console.log("Navigating to Media Console Cabinet...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        const consoleFurn = document.getElementById('furniture-furn-media-console');
        if (consoleFurn) consoleFurn.click();
      })()
    `
  });
  await wait(700);

  // Click Left Drawer (Cables & Adapters)
  console.log("Navigating to Left Drawer (Cables & Adapters)...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        const title = Array.from(document.querySelectorAll('h3')).find(el => el.textContent.includes('Left Drawer'));
        if (title) title.closest('div[class*="cursor-pointer"]').click();
      })()
    `
  });
  await wait(800);

  // Measure scroll container
  const scrollInfo = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const scroller = document.querySelector('div.overflow-y-auto');
        if (!scroller) return { error: 'No scroller found' };
        return {
          clientHeight: scroller.clientHeight,
          scrollHeight: scroller.scrollHeight,
          scrollTop: scroller.scrollTop,
          canScroll: scroller.scrollHeight > scroller.clientHeight
        };
      })()
    `,
    returnByValue: true
  });
  console.log("Scroller Metrics (Top):", scrollInfo.result.value);

  // Perform scroll down
  console.log("Performing smooth scroll down by 350px...");
  const scrollDownResult = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const scroller = document.querySelector('div.overflow-y-auto');
        if (!scroller) return null;
        scroller.scrollTop = 350;
        return {
          scrollTop: scroller.scrollTop,
          maxScroll: scroller.scrollHeight - scroller.clientHeight
        };
      })()
    `,
    returnByValue: true
  });
  console.log("Scroller Metrics (After Scroll):", scrollDownResult.result.value);
  await wait(600);

  // Capture screenshot of scrolled compartment
  const ss = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const fullPath = path.join(ARTIFACTS_DIR, "06_compartment_scrolled_smoothly.png");
  fs.writeFileSync(fullPath, Buffer.from(ss.data, 'base64'));
  console.log("Saved screenshot:", fullPath);

  // Cleanup
  ws.close();
  edge.kill();
  preview.kill();
  console.log("Scroll test complete!");
}

main().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});
