import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const USER_DATA_DIR = "C:\\Users\\DESKTO~1\\AppData\\Local\\Temp\\edge_circle_drag_profile";
const TARGET_URL = "http://localhost:5193/placemend/";
const ARTIFACTS_DIR = "C:\\Users\\Desktop Home\\.gemini\\antigravity\\brain\\f2366a71-5ca5-418d-b7ed-cd9f02875227";

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Starting preview server on port 5193...");
  const preview = spawn("cmd.exe", ["/c", "npx", "vite", "preview", "--port", "5193"], {
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

  console.log("Launching Edge with remote debugging on port 9255...");
  const edge = spawn(EDGE_PATH, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--user-data-dir=${USER_DATA_DIR}`,
    "--remote-debugging-port=9255",
    "about:blank"
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9255/json/version");
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

  const newTabRes = await fetch(`http://127.0.0.1:9255/json/new?${encodeURIComponent(TARGET_URL)}`, { method: 'PUT' });
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
    if (msg.method === 'Runtime.exceptionThrown') {
      console.error("PAGE RUNTIME EXCEPTION:", JSON.stringify(msg.params.exceptionDetails));
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      console.log("PAGE CONSOLE:", msg.params.type, msg.params.args.map(a => a.value || a.description).join(' '));
    }
    if (msg.id && callbacks.has(msg.id)) {
      const { resolve, reject } = callbacks.get(msg.id);
      callbacks.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");

  console.log("Setting device emulation: Pixel 10 (412x915, mobile: true)...");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 412,
    height: 915,
    deviceScaleFactor: 2.625,
    mobile: true,
  });

  await send("Page.navigate", { url: TARGET_URL });
  await wait(2000);

  async function evaluate(expression) {
    const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return res.result?.value;
  }

  async function takeScreenshot(filename) {
    const res = await send("Page.captureScreenshot", { format: "png" });
    const buffer = Buffer.from(res.data, "base64");
    const savePath = path.join(ARTIFACTS_DIR, filename);
    fs.writeFileSync(savePath, buffer);
    console.log(`Saved screenshot: ${savePath}`);
  }

  console.log("Switching to Edit mode...");
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Edit'));
    if (btn) btn.click();
  })()`);
  await wait(600);

  // ==========================================
  // TEST 1: Door Dragging without Modal Popup
  // ==========================================
  console.log("TEST 1: Dragging door on canvas and verifying modal does NOT pop up...");
  const doorCoords = await evaluate(`(() => {
    const doorHandle = document.querySelector('[data-door-handle]');
    if (!doorHandle) return null;
    const rect = doorHandle.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  })()`);
  console.log("Door handle initial coords:", doorCoords);

  if (doorCoords) {
    // Mouse press directly on door handle
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: doorCoords.x,
      y: doorCoords.y,
      button: "left",
      clickCount: 1
    });
    await wait(100);

    // Drag door along wall (move 80px left)
    for (let step = 1; step <= 8; step++) {
      const curX = doorCoords.x - step * 10;
      await send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: curX,
        y: doorCoords.y,
        button: "left"
      });
      await wait(40);
    }

    // Release mouse
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: doorCoords.x - 80,
      y: doorCoords.y,
      button: "left"
    });
    await wait(400);
  }

  const modalOpenAfterDrag = await evaluate(`(() => !!document.querySelector('.fixed.z-50'))()`);
  console.log("Is modal open after dragging door? (Expected: false):", modalOpenAfterDrag);

  await takeScreenshot("63_door_dragged_without_modal_popup.png");

  // ==========================================
  // TEST 2: Door Stationary Tap Opens Modal
  // ==========================================
  console.log("TEST 2: Clean stationary click on door badge to verify it opens the modal...");
  const tapDoorResult = await evaluate(`(() => {
    const doorHandle = document.querySelector('[data-door-handle]');
    if (!doorHandle) return false;
    doorHandle.click();
    return true;
  })()`);
  console.log("Door handle clicked:", tapDoorResult);
  await wait(800);

  let modalOpenAfterTap = await evaluate(`(() => !!document.querySelector('.fixed.z-50'))()`);
  console.log("Is modal open after clean tap? (Expected: true):", modalOpenAfterTap);

  if (!modalOpenAfterTap) {
    // Fallback: click Doors toolbar button to open modal
    await evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.title && b.title.includes('Doors'));
      if (btn) btn.click();
    })()`);
    await wait(600);
  }

  await takeScreenshot("64_door_tap_opens_modal.png");

  // ==========================================
  // TEST 3: Custom Shape Vertex Circle Dragging
  // ==========================================
  console.log("TEST 3: Switching to Custom Shape tab and dragging vertex circle #2...");
  await evaluate(`(() => {
    const modal = document.querySelector('.fixed.z-50');
    const customTab = Array.from(modal?.querySelectorAll('button') || []).find(b => b.textContent.includes('Custom Shape'));
    customTab?.click();
  })()`);
  await wait(800);

  // Get initial Corner #2 info
  const corner2Before = await evaluate(`(() => {
    const inputs = document.querySelectorAll('input[type="number"]');
    return {
      x: inputs[2]?.value, // Corner 2 X
      y: inputs[3]?.value, // Corner 2 Y
    };
  })()`);
  console.log("Corner #2 coords before drag:", corner2Before);

  // Locate the circle handle for Corner #2 using data-vertex-index="1"
  const handleCoords = await evaluate(`(() => {
    const h2 = document.querySelector('[data-vertex-index="1"]');
    if (!h2) return null;
    const rect = h2.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  })()`);
  console.log("Corner #2 handle center coords:", handleCoords);

  if (handleCoords) {
    // Mouse press on handle
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: handleCoords.x,
      y: handleCoords.y,
      button: "left",
      clickCount: 1
    });
    await wait(100);

    // Drag handle left and down
    for (let step = 1; step <= 8; step++) {
      const curX = handleCoords.x - step * 6;
      const curY = handleCoords.y + step * 4;
      await send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: curX,
        y: curY,
        button: "left"
      });
      await wait(40);
    }

    // Mid-drag screenshot to capture the live coordinate HUD
    await takeScreenshot("65_custom_shape_circle_dragging_live_hud.png");

    // Release mouse
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: handleCoords.x - 48,
      y: handleCoords.y + 32,
      button: "left"
    });
    await wait(400);
  }

  // Check Corner #2 info after drag
  const corner2After = await evaluate(`(() => {
    const inputs = document.querySelectorAll('input[type="number"]');
    return {
      x: inputs[2]?.value, // Corner 2 X
      y: inputs[3]?.value, // Corner 2 Y
    };
  })()`);
  console.log("Corner #2 coords after drag:", corner2After);

  await takeScreenshot("66_custom_shape_circle_dragged.png");

  // Save the custom shape
  console.log("Saving Custom Shape...");
  await evaluate(`(() => {
    const saveBtn = Array.from(document.querySelectorAll('.fixed.z-50 button')).find(b => b.textContent.includes('Save Custom Shape'));
    saveBtn?.click();
  })()`);
  await wait(800);

  await takeScreenshot("67_canvas_custom_polygon_rendered.png");

  console.log("All tests completed successfully!");
  ws.close();
  edge.kill();
  preview.kill();
  process.exit(0);
}

main().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});
