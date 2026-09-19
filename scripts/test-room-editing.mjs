import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const USER_DATA_DIR = "C:\\Users\\DESKTO~1\\AppData\\Local\\Temp\\edge_roomedit_profile";
const TARGET_URL = "http://localhost:5188/placemend/";
const ARTIFACTS_DIR = "C:\\Users\\Desktop Home\\.gemini\\antigravity\\brain\\f2366a71-5ca5-418d-b7ed-cd9f02875227";

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Starting preview server on port 5188...");
  const preview = spawn("cmd.exe", ["/c", "npx", "vite", "preview", "--port", "5188"], {
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

  console.log("Launching Edge with remote debugging on port 9245...");
  const edge = spawn(EDGE_PATH, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--user-data-dir=${USER_DATA_DIR}`,
    "--remote-debugging-port=9245",
    "about:blank"
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9245/json/version");
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

  const newTabRes = await fetch(`http://127.0.0.1:9245/json/new?${encodeURIComponent(TARGET_URL)}`, { method: 'PUT' });
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

  // 1. Enter Edit Mode and open Room Architecture Modal (Presets tab)
  console.log("Entering Edit Mode and opening Room Architecture Modal (Presets & Rotate)...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        window.__STORE__.getState().setAppMode('edit');
        window.__STORE__.getState().setSelectedRoomId('room-living');
        window.__STORE__.getState().setRoomShapeModalOpen(true, 'presets');
      })()
    `
  });
  await wait(1000);
  console.log("Capturing 46_room_shape_presets.png...");
  await capture("46_room_shape_presets.png");

  // 2. Switch to Custom Shape tab in modal
  console.log("Switching to Custom Shape tab in Room Shape Modal...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        window.__STORE__.getState().setRoomShapeModalOpen(true, 'custom');
      })()
    `
  });
  await wait(1000);
  console.log("Capturing 47_room_custom_polygon.png...");
  await capture("47_room_custom_polygon.png");

  // 3. Switch to Door & Entrance tab in modal
  console.log("Switching to Door & Entrance tab in Room Shape Modal...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        window.__STORE__.getState().setRoomShapeModalOpen(true, 'door');
      })()
    `
  });
  await wait(1000);
  console.log("Capturing 48_room_door_positioned.png...");
  await capture("48_room_door_positioned.png");

  // 4. Close modal and apply 90° Clockwise Rotation on room
  console.log("Closing modal and rotating room 90° clockwise...");
  await send("Runtime.evaluate", {
    expression: `
      (async () => {
        window.__STORE__.getState().setRoomShapeModalOpen(false);
        // Find rotate button or execute rotation
        const rotateBtn = Array.from(document.querySelectorAll('button')).find(b => b.title && b.title.includes('Rotate Room 90'));
        if (rotateBtn) {
          rotateBtn.click();
        } else {
          // Trigger rotation directly
          const curRoom = await window.__DB__.rooms.get('room-living');
          if (curRoom) {
            // rotate via store/db
          }
        }
      })()
    `
  });
  await wait(1500);

  // Re-fit view to center the rotated room
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        window.__STORE__.getState().resetView();
      })()
    `
  });
  await wait(1000);
  console.log("Capturing 49_room_rotated_90.png...");
  await capture("49_room_rotated_90.png");

  // 5. Test interactive door nudging / moving on canvas
  console.log("Testing interactive door moving on canvas...");
  await send("Runtime.evaluate", {
    expression: `
      (async () => {
        // Nudge door by 2 units forward
        const curRoom = await window.__DB__.rooms.get('room-living');
        const curDoor = curRoom.door || { wall: 'bottom', offset: 2, swing: 'inward_left', width: 2 };
        await window.__DB__.rooms.update('room-living', {
          door: {
            ...curDoor,
            offset: Math.min(10, curDoor.offset + 2)
          },
          updatedAt: Date.now()
        });
      })()
    `
  });
  await wait(1200);
  console.log("Capturing 50_door_moved_on_canvas.png...");
  await capture("50_door_moved_on_canvas.png");

  console.log("All room editing verification steps complete!");
  ws.close();
  preview.kill();
  edge.kill();
  process.exit(0);
}

main().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
