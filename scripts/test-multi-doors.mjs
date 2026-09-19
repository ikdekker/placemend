import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const USER_DATA_DIR = "C:\\Users\\DESKTO~1\\AppData\\Local\\Temp\\edge_multidoors_profile";
const TARGET_URL = "http://localhost:5192/placemend/";
const ARTIFACTS_DIR = "C:\\Users\\Desktop Home\\.gemini\\antigravity\\brain\\f2366a71-5ca5-418d-b7ed-cd9f02875227";

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Building production bundle...");
  const buildProc = spawn("cmd.exe", ["/c", "npm", "run", "build"], {
    cwd: "C:\\Users\\Desktop Home\\Workspace\\placemend",
    stdio: 'inherit'
  });
  await new Promise((resolve) => buildProc.on('close', resolve));

  console.log("Starting preview server on port 5192...");
  const preview = spawn("cmd.exe", ["/c", "npx", "vite", "preview", "--port", "5192"], {
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

  console.log("Launching Edge with remote debugging on port 9252...");
  const edge = spawn(EDGE_PATH, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--user-data-dir=${USER_DATA_DIR}`,
    "--remote-debugging-port=9252",
    "about:blank"
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9252/json/version");
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

  const newTabRes = await fetch(`http://127.0.0.1:9252/json/new?${encodeURIComponent(TARGET_URL)}`, { method: 'PUT' });
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

  // 1. Open Door & Entrance tab in modal
  console.log("Opening Doors & Entrances tab in modal...");
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

  // 2. Add Door 2 (Balcony Door on Left Wall) and Door 3 (Patio on Top Wall)
  console.log("Adding and configuring multiple doors...");
  await send("Runtime.evaluate", {
    expression: `
      (async () => {
        // Find Add Door button
        const addBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Add Door'));
        if (addBtn) {
          addBtn.click();
          await new Promise(r => setTimeout(r, 400));
          // Change name of door 2
          const nameInputs = document.querySelectorAll('input[type="text"]');
          const lastInput = nameInputs[nameInputs.length - 1];
          if (lastInput) {
            lastInput.value = "Balcony Door";
            lastInput.dispatchEvent(new Event('input', { bubbles: true }));
            lastInput.dispatchEvent(new Event('change', { bubbles: true }));
          }

          // Click Left wall button
          const leftWallBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Left Wall'));
          if (leftWallBtn) leftWallBtn.click();
          await new Promise(r => setTimeout(r, 300));

          // Add third door
          addBtn.click();
          await new Promise(r => setTimeout(r, 400));
          const nameInputs2 = document.querySelectorAll('input[type="text"]');
          const lastInput2 = nameInputs2[nameInputs2.length - 1];
          if (lastInput2) {
            lastInput2.value = "Patio Double Door";
            lastInput2.dispatchEvent(new Event('input', { bubbles: true }));
            lastInput2.dispatchEvent(new Event('change', { bubbles: true }));
          }
          // Set to Top wall
          const topWallBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Top Wall'));
          if (topWallBtn) topWallBtn.click();
          await new Promise(r => setTimeout(r, 300));
          // Set to 3m Double Doors
          const doubleDoorBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Double Doors'));
          if (doubleDoorBtn) doubleDoorBtn.click();
        }
      })()
    `
  });
  await wait(1500);

  console.log("Capturing 55_multi_doors_modal_blueprint.png...");
  await capture("55_multi_doors_modal_blueprint.png");

  // 3. Close modal via Done button (no manual save needed, auto-persisted!)
  console.log("Closing modal via Done button (auto-persisted live)...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        const doneBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.trim() === 'Done');
        if (doneBtn) doneBtn.click();
      })()
    `
  });
  await wait(1500);

  console.log("Capturing 56_canvas_with_multiple_doors.png...");
  await capture("56_canvas_with_multiple_doors.png");

  // 4. Test Mirror Horizontally with multiple doors
  console.log("Triggering Mirror Horizontally with multiple doors...");
  await send("Runtime.evaluate", {
    expression: `
      (async () => {
        const mirrorBtn = Array.from(document.querySelectorAll('button')).find(b => b.title && b.title.includes('Mirror Horizontally'));
        if (mirrorBtn) mirrorBtn.click();
      })()
    `
  });
  await wait(1500);

  console.log("Capturing 57_multi_doors_mirrored.png...");
  await capture("57_multi_doors_mirrored.png");

  console.log("Tests completed successfully!");
  preview.kill();
  edge.kill();
  process.exit(0);
}

main().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
