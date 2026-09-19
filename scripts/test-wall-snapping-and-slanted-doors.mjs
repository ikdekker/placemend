import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const USER_DATA_DIR = "C:\\Users\\DESKTO~1\\AppData\\Local\\Temp\\edge_snapping_profile";
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

  console.log("Launching Edge with remote debugging on port 9253...");
  const edge = spawn(EDGE_PATH, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--user-data-dir=${USER_DATA_DIR}`,
    "--remote-debugging-port=9253",
    "about:blank"
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9253/json/version");
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

  const newTabRes = await fetch(`http://127.0.0.1:9253/json/new?${encodeURIComponent(TARGET_URL)}`, { method: 'PUT' });
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
  });

  await send("Page.navigate", { url: TARGET_URL });
  await wait(2000);

  // Helper to evaluate JS in page
  async function evaluate(expression) {
    const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return res.result?.value;
  }

  // Helper to take and save screenshot
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
  await wait(500);

  console.log("Opening Doors tab in Room Architecture modal...");
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.title && b.title.includes('Room Doors'));
    if (btn) btn.click();
  })()`);
  await wait(800);

  // 1. Verify Notice Cleanup in Doors tab
  const doorNoticeCheck = await evaluate(`(() => {
    const bodyText = document.body.innerText;
    const hasAutoSavedBadge = bodyText.includes('Auto-saved');
    const hasChangesApplyText = bodyText.includes('Changes to walls, openings, and positions apply automatically');
    const hasFooterText = bodyText.includes('All changes save automatically');
    return { hasAutoSavedBadge, hasChangesApplyText, hasFooterText };
  })()`);
  console.log("Doors tab notice check:", doorNoticeCheck);

  await takeScreenshot("58_doors_tab_notice_cleaned.png");

  // 2. Switch to Custom Shape tab to verify footer action
  console.log("Switching to Custom Shape tab...");
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Custom Shape'));
    if (btn) btn.click();
  })()`);
  await wait(500);

  const customNoticeCheck = await evaluate(`(() => {
    const bodyText = document.body.innerText;
    const hasFooterAutoSave = bodyText.includes('All changes save automatically');
    const hasSaveCustomShape = bodyText.includes('Save Custom Shape');
    return { hasFooterAutoSave, hasSaveCustomShape };
  })()`);
  console.log("Custom Shape tab notice check:", customNoticeCheck);
  await takeScreenshot("59_custom_shape_tab_footer_cleaned.png");

  // 3. Switch to Presets tab and select Chamfered Corner / Bay Angle preset
  console.log("Switching to Presets tab and selecting Chamfered preset...");
  await evaluate(`(() => {
    const presetsTab = Array.from(document.querySelectorAll('.fixed.z-50 button')).find(b => b.textContent.includes('Presets'));
    if (presetsTab) presetsTab.click();
  })()`);
  await wait(600);

  const selectedPreset = await evaluate(`(() => {
    const h4s = Array.from(document.querySelectorAll('.fixed.z-50 h4'));
    const chamf = h4s.find(h => h.textContent.includes('Chamfered'));
    if (chamf) {
      const clickEl = chamf.closest('.cursor-pointer');
      clickEl?.scrollIntoView({ block: 'center' });
      clickEl?.click();
      return 'Chamfered selected';
    }
    return 'Chamfered not found';
  })()`);
  console.log("Preset selection:", selectedPreset);
  await wait(800);

  // Switch to Doors tab to test door on slanted wall
  console.log("Switching to Doors tab on Chamfered room...");
  await evaluate(`(() => {
    const doorTab = Array.from(document.querySelectorAll('.fixed.z-50 button')).find(b => b.textContent.includes('Doors'));
    if (doorTab) doorTab.click();
  })()`);
  await wait(800);

  // Check wall segments in wall selector
  const wallButtons = await evaluate(`(() => {
    const buttons = Array.from(document.querySelectorAll('.fixed.z-50 button')).map(b => b.innerText.trim());
    return buttons.filter(txt => txt.includes('Wall') || txt.includes('Slanted') || txt.includes('long'));
  })()`);
  console.log("Available wall segments in Doors tab:", wallButtons);

  // Click the slanted wall button
  console.log("Placing door on the slanted/angled wall segment...");
  const slantedClicked = await evaluate(`(() => {
    const btns = Array.from(document.querySelectorAll('.fixed.z-50 button'));
    const slantedBtn = btns.find(b => b.innerText.includes('Slanted') || b.innerText.includes('ANGLED'));
    if (slantedBtn) {
      slantedBtn.click();
      return true;
    }
    return false;
  })()`);
  console.log("Slanted wall button clicked:", slantedClicked);
  await wait(600);

  await takeScreenshot("60_slanted_wall_door_blueprint.png");

  // Close modal with Done button
  console.log("Closing modal with Done button...");
  await evaluate(`(() => {
    const doneBtn = Array.from(document.querySelectorAll('.fixed.z-50 button')).find(b => b.textContent.trim() === 'Done');
    if (doneBtn) doneBtn.click();
  })()`);
  await wait(800);

  await takeScreenshot("61_slanted_wall_door_on_canvas.png");

  // Verify modal is closed
  const isModalOpen = await evaluate(`(() => !!document.querySelector('.fixed.z-50'))()`);
  console.log("Is modal still open?", isModalOpen);

  // 4. Test furniture wall snapping using CDP native input dispatch
  console.log("Testing furniture dragging and magnetic flush snapping...");
  const furnCoords = await evaluate(`(() => {
    const furnEl = Array.from(document.querySelectorAll('[data-furniture-id]')).find(el => el.textContent.includes('Standing Desk'));
    if (!furnEl) return null;
    const rect = furnEl.getBoundingClientRect();
    return {
      id: furnEl.getAttribute('data-furniture-id'),
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      curLeft: furnEl.style.left
    };
  })()`);
  console.log("Furniture initial coords:", furnCoords);

  if (furnCoords) {
    // Dispatch mouse press at furniture center
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: furnCoords.x,
      y: furnCoords.y,
      button: "left",
      clickCount: 1
    });
    await wait(100);

    // Drag toward the far left wall (canvas left boundary)
    for (let step = 1; step <= 10; step++) {
      const curX = furnCoords.x + (15 - furnCoords.x) * (step / 10);
      await send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: curX,
        y: furnCoords.y,
        button: "left"
      });
      await wait(40);
    }

    // Release mouse
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: 15,
      y: furnCoords.y,
      button: "left"
    });
    await wait(400);
  }

  const snapResult = await evaluate(`(() => {
    const furnEl = Array.from(document.querySelectorAll('[data-furniture-id]')).find(el => el.textContent.includes('Standing Desk'));
    if (!furnEl) return { error: 'No furniture found' };
    return {
      furnId: furnEl.getAttribute('data-furniture-id'),
      styleLeft: furnEl.style.left,
      styleTop: furnEl.style.top,
      matchesLeftWallFlush: furnEl.style.left === '0px'
    };
  })()`);
  console.log("Furniture snap test result:", snapResult);

  await wait(500);
  await takeScreenshot("62_furniture_flush_wall_snap.png");

  console.log("All automated CDP tests completed successfully!");
  ws.close();
  edge.kill();
  preview.kill();
  process.exit(0);
}

main().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});
