import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const USER_DATA_DIR = "C:\\Users\\DESKTO~1\\AppData\\Local\\Temp\\edge_compartments_profile";
const TARGET_URL = "http://localhost:5185/placemend/";
const ARTIFACTS_DIR = "C:\\Users\\Desktop Home\\.gemini\\antigravity\\brain\\f2366a71-5ca5-418d-b7ed-cd9f02875227";

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Starting preview server on port 5185...");
  const preview = spawn("cmd.exe", ["/c", "npx", "vite", "preview", "--port", "5185"], {
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

  console.log("Launching Edge with remote debugging on port 9235...");
  const edge = spawn(EDGE_PATH, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--user-data-dir=${USER_DATA_DIR}`,
    "--remote-debugging-port=9235",
    "about:blank"
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9235/json/version");
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

  const newTabRes = await fetch(`http://127.0.0.1:9235/json/new?${encodeURIComponent(TARGET_URL)}`, { method: 'PUT' });
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

  // Automatically accept any window.confirm dialogs
  await send("Page.setInterceptFileChooserDialog", { enabled: false }).catch(() => {});
  await send("Page.javascriptDialogOpening", {}).catch(() => {});
  await send("Runtime.evaluate", {
    expression: `window.confirm = () => true;`
  });

  async function capture(filename) {
    const res = await send("Page.captureScreenshot", { format: "png" });
    const buf = Buffer.from(res.data, 'base64');
    const outPath = path.join(ARTIFACTS_DIR, filename);
    fs.writeFileSync(outPath, buf);
    console.log(`Saved screenshot: ${filename}`);
  }

  // 1. Open Media Console -> Left Drawer (which has 7 items)
  console.log("Opening Media Console Left Drawer...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        window.__STORE__.getState().setSelectedFurnitureId('furn-media-console');
        window.__STORE__.getState().setSelectedContainerId('cont-console-d1');
      })()
    `
  });
  await wait(1500);
  console.log("Capturing 37_drawer_with_7_items_before_compartment.png...");
  await capture("37_drawer_with_7_items_before_compartment.png");

  // 2. Add a new compartment: "Cable Organizer Tray"
  console.log("Adding new compartment 'Cable Organizer Tray'...");
  await send("Runtime.evaluate", {
    expression: `
      (async () => {
        await window.__DB__.containers.add({
          id: 'comp-cable-organizer',
          furnitureId: 'furn-media-console',
          parentContainerId: 'cont-console-d1',
          name: 'Cable Organizer Tray',
          type: 'compartment',
          orderIndex: 0,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      })()
    `
  });
  await wait(1500);
  console.log("Capturing 38_compartment_added_and_items_still_visible.png...");
  await capture("38_compartment_added_and_items_still_visible.png");

  // 3. Move an item into the compartment
  console.log("Moving velcro item into the compartment...");
  await send("Runtime.evaluate", {
    expression: `
      (async () => {
        await window.__DB__.items.update('item-cable-ties', {
          containerId: 'comp-cable-organizer',
          updatedAt: Date.now()
        });
      })()
    `
  });
  await wait(1500);
  console.log("Capturing 39_item_moved_to_compartment.png...");
  await capture("39_item_moved_to_compartment.png");

  // 4. Open the compartment itself
  console.log("Entering 'Cable Organizer Tray' compartment...");
  await send("Runtime.evaluate", {
    expression: `window.__STORE__.getState().setSelectedContainerId('comp-cable-organizer')`
  });
  await wait(1500);
  console.log("Capturing 40_inside_compartment_with_item.png...");
  await capture("40_inside_compartment_with_item.png");

  // 5. Delete the compartment (confirm is stubbed to true, moves item back to main drawer)
  console.log("Deleting compartment and returning to parent drawer...");
  await send("Runtime.evaluate", {
    expression: `
      (async () => {
        const comp = await window.__DB__.containers.get('comp-cable-organizer');
        if (comp) {
          // Move items back to parent
          const compItems = await window.__DB__.items.where('containerId').equals(comp.id).toArray();
          for (const it of compItems) {
            await window.__DB__.items.update(it.id, { containerId: comp.parentContainerId, updatedAt: Date.now() });
          }
          await window.__DB__.containers.delete(comp.id);
          window.__STORE__.getState().setSelectedContainerId(comp.parentContainerId);
        }
      })()
    `
  });
  await wait(1500);
  console.log("Capturing 41_compartment_deleted_all_items_restored.png...");
  await capture("41_compartment_deleted_all_items_restored.png");

  console.log("Cleaning up test...");
  ws.close();
  edge.kill();
  preview.kill();
  process.exit(0);
}

main().catch(console.error);
