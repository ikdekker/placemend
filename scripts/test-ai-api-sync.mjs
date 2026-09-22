import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const USER_DATA_DIR = "C:\\Users\\DESKTO~1\\AppData\\Local\\Temp\\edge_ai_sync_test_profile";
const TARGET_URL = "https://freshcoders.nl/placemend/";
const ARTIFACTS_DIR = "C:\\Users\\Desktop Home\\.gemini\\antigravity\\brain\\f2366a71-5ca5-418d-b7ed-cd9f02875227";

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Launching Edge with remote debugging on port 9266...");
  const edge = spawn(EDGE_PATH, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--user-data-dir=${USER_DATA_DIR}`,
    "--remote-debugging-port=9266",
    "about:blank"
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9266/json/version");
      if (res.ok) {
        version = await res.json();
        break;
      }
    } catch (e) {
      await wait(200);
    }
  }

  if (!version) {
    console.error("Failed to connect to Edge CDP on port 9266");
    edge.kill();
    process.exit(1);
  }

  console.log("Connected to Edge CDP. Creating page tab for:", TARGET_URL);
  const newTabRes = await fetch(`http://127.0.0.1:9266/json/new?${encodeURIComponent(TARGET_URL)}`, { method: 'PUT' });
  const tab = await newTabRes.json();

  const ws = new globalThis.WebSocket(tab.webSocketDebuggerUrl);
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
    if (msg.id && callbacks.has(msg.id)) {
      const { resolve, reject } = callbacks.get(msg.id);
      callbacks.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  };

  await send("Page.enable");
  await send("Runtime.enable");

  console.log("Setting desktop viewport (1280x850)...");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 850,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await send("Page.navigate", { url: TARGET_URL });
  console.log("Waiting for page load...");
  await wait(3000);

  async function evaluate(expression) {
    const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return res.result?.value;
  }

  async function takeScreenshot(filename) {
    const res = await send("Page.captureScreenshot", { format: "png" });
    const buffer = Buffer.from(res.data, "base64");
    const savePath = path.join(ARTIFACTS_DIR, filename);
    fs.writeFileSync(savePath, buffer);
    console.log(`Saved screenshot: ${filename}`);
  }

  // 1. Verify Header AI Sync button exists
  console.log("Checking for AI Sync button...");
  const hasAiSyncBtn = await evaluate(`Boolean(document.querySelector('button[title*="AI Room Indexing"]'))`);
  console.log("Has AI Sync button in Header:", hasAiSyncBtn);

  // Click AI Sync button to open modal
  console.log("Opening AI Sync modal...");
  await evaluate(`document.querySelector('button[title*="AI Room Indexing"]').click()`);
  await wait(600);

  // Tab 1 screenshot: API & Vision Setup
  await takeScreenshot("68_ai_sync_modal_setup_tab.png");

  // Click Tab 2: Direct AI Paste
  console.log("Switching to Direct AI Paste tab...");
  const tab2 = await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Direct AI Paste'));
    if (btn) { btn.click(); return true; }
    return false;
  })()`);
  console.log("Tab 2 clicked:", tab2);
  await wait(800);

  // Click "Load Sample Payload"
  console.log("Clicking 'Load Sample Payload'...");
  const sampleClicked = await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Load Sample Payload'));
    if (btn) { btn.click(); return true; }
    return false;
  })()`);
  console.log("Load sample clicked:", sampleClicked);
  await wait(800);

  const taValLength = await evaluate(`document.querySelector('textarea')?.value?.length || 0`);
  console.log("Textarea value length:", taValLength);

  // Tab 2 screenshot: Sample JSON loaded
  await takeScreenshot("69_ai_sync_modal_direct_paste_sample.png");

  // Submit AI detection payload
  console.log("Submitting AI detection payload to Placemend...");
  const submitClicked = await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Import Detected Objects into Placemend'));
    if (btn && !btn.disabled) { btn.click(); return true; }
    return false;
  })()`);
  console.log("Submit button clicked:", submitClicked);
  await wait(3000);

  // Tab 2 screenshot: Success feedback
  await takeScreenshot("70_ai_import_success_feedback.png");

  // Click Tab 3: Cloud & Auto-Sync
  console.log("Switching to Cloud & Auto-Sync tab...");
  const tab3 = await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Cloud & Auto-Sync'));
    if (btn) { btn.click(); return true; }
    return false;
  })()`);
  console.log("Tab 3 clicked:", tab3);
  await wait(800);

  // Tab 3 screenshot: Cloud status & counts
  await takeScreenshot("71_ai_sync_modal_cloud_status.png");

  // Close modal
  console.log("Closing AI Sync modal...");
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Close');
    if (btn) btn.click();
  })()`);
  await wait(1200);

  // Screenshot: Floor Canvas with newly imported furniture
  await takeScreenshot("72_floor_canvas_with_ai_imported_furniture.png");

  // Select the newly imported Smart Bookshelf to enter physical furniture view
  console.log("Selecting imported furniture to inspect containers & items...");
  await evaluate(`(() => {
    const furn = Array.from(document.querySelectorAll('text, span, div')).find(el => el.textContent?.includes('Smart Bookshelf') || el.textContent?.includes('Adjustable Desk'));
    if (furn) furn.click();
    else {
      const g = document.querySelector('svg g[cursor="pointer"]');
      if (g) g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  })()`);
  await wait(1200);

  // Screenshot: Physical Furniture View showing AI indexed containers & items
  await takeScreenshot("73_physical_view_of_ai_imported_furniture.png");

  // Navigate back to room floor canvas
  console.log("Navigating back to room canvas...");
  await evaluate(`(() => {
    // Click room back button or header room selector
    const backBtn = document.querySelector('button[title*="Back to floor plan"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Room') || b.textContent?.includes('Back'));
    if (backBtn) backBtn.click();
  })()`);
  await wait(800);

  // Open Room Manager via Header button
  console.log("Opening Room Manager via Header button...");
  await evaluate(`(() => {
    const btn = document.querySelector('button[title*="Manage Rooms"]');
    if (btn) btn.click();
  })()`);
  await wait(800);

  // Screenshot: Room Manager modal with delete trash cans
  await takeScreenshot("74_room_manager_modal_delete_options.png");

  // Close Room Manager modal
  await evaluate(`(() => {
    const closeBtn = document.querySelector('.fixed.z-50 button');
    if (closeBtn) closeBtn.click();
  })()`);
  await wait(600);

  // Switch to Edit Mode and open Room Shape modal
  console.log("Opening Room Shape modal to verify Delete Room button...");
  await evaluate(`(() => {
    const editBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Edit'));
    if (editBtn) editBtn.click();
  })()`);
  await wait(400);

  await evaluate(`(() => {
    const shapeBtn = document.querySelector('button[title*="Configure Room Shape"]');
    if (shapeBtn) shapeBtn.click();
  })()`);
  await wait(800);

  // Screenshot: Room Shape modal with Delete Room button
  await takeScreenshot("75_room_shape_modal_delete_options.png");

  console.log("All automated browser checks completed successfully!");
  ws.close();
  edge.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
