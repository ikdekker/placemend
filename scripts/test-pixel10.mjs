import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const USER_DATA_DIR = "C:\\Users\\DESKTO~1\\AppData\\Local\\Temp\\edge_pixel10_profile";
const TARGET_URL = "http://localhost:5174/placemend/";
const OUTPUT_PNG = "C:\\Users\\Desktop Home\\.gemini\\antigravity\\brain\\f2366a71-5ca5-418d-b7ed-cd9f02875227\\pixel10_verified.png";

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Launching Edge with remote debugging...");
  const edge = spawn(EDGE_PATH, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--user-data-dir=${USER_DATA_DIR}`,
    "--remote-debugging-port=9222",
    "about:blank"
  ], { stdio: 'ignore' });

  // Wait for port 9222 to be available
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
    process.exit(1);
  }

  console.log("Connected to browser:", version.Browser);

  // Create new target tab
  const newTabRes = await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(TARGET_URL)}`, { method: 'PUT' });
  const tab = await newTabRes.json();
  console.log("Opened tab:", tab.id);

  // Connect WebSocket
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
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      console.log(`[Browser Console ${msg.params.type}]`, ...msg.params.args.map(a => a.value || a.description));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      console.error('[Browser Exception]', msg.params.exceptionDetails);
    }
  };

  await send("Page.enable");
  await send("Runtime.enable");

  // Emulate Pixel (412 x 915, mobile touch)
  console.log("Setting emulation: 412x915, mobile: true, dsf: 2.625");
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

  // Navigate to page
  console.log("Navigating to:", TARGET_URL);
  await send("Page.navigate", { url: TARGET_URL });

  // Wait for loading and Dexie DB seeding
  console.log("Waiting 3.5s for React, IndexedDB seeding, and auto-fit...");
  await wait(3500);

  // Capture Screenshot 1 (Floor plan centered)
  console.log("Capturing screenshot 1 (Floor plan)...");
  const ss1 = await send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  const buffer1 = Buffer.from(ss1.data, 'base64');
  fs.writeFileSync(OUTPUT_PNG, buffer1);
  console.log("Saved screenshot to:", OUTPUT_PNG);

  // Click on furniture to open Inspector
  console.log("Simulating tap on furniture piece...");
  const clickResult = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const el = document.querySelector('[data-furniture-id]');
        if (!el) return 'Element not found';
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return 'Clicked: ' + el.getAttribute('data-furniture-id');
      })()
    `
  });
  console.log("Click result:", clickResult.result?.value);
  await wait(800);

  const INSPECTOR_PNG = "C:\\Users\\Desktop Home\\.gemini\\antigravity\\brain\\f2366a71-5ca5-418d-b7ed-cd9f02875227\\pixel10_inspector.png";
  console.log("Capturing screenshot 2 (Inspector open)...");
  const ss2 = await send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  const buffer2 = Buffer.from(ss2.data, 'base64');
  fs.writeFileSync(INSPECTOR_PNG, buffer2);
  console.log("Saved inspector screenshot to:", INSPECTOR_PNG);

  // Cleanup
  ws.close();
  edge.kill();
  console.log("Done!");
}

main().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
