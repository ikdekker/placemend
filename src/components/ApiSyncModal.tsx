import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { 
  X, 
  Copy, 
  Check, 
  RotateCcw, 
  RefreshCw, 
  Sparkles, 
  Code, 
  Cloud, 
  Upload, 
  Download, 
  Layers, 
  Zap, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  Cpu
} from 'lucide-react';
import { 
  getWorkspaceApiKey, 
  setWorkspaceApiKey, 
  generateNewApiKey, 
  isAutoSyncEnabled, 
  setAutoSyncEnabled, 
  syncBidirectional, 
  pushLocalToRemote, 
  pullRemoteToLocal, 
  submitAiPayload,
  API_BASE_URL 
} from '../services/apiSync';

type ModalTab = 'api' | 'import' | 'sync';

export const ApiSyncModal: React.FC = () => {
  const { isApiSyncModalOpen, setApiSyncModalOpen, selectedRoomId } = useAppStore();

  const [activeTab, setActiveTab] = useState<ModalTab>('api');
  const [apiKey, setApiKey] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  // Direct AI import state
  const [jsonInput, setJsonInput] = useState<string>('');
  const [targetRoom, setTargetRoom] = useState<string>('current');
  const [importStatus, setImportStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<{ success?: boolean; text?: string } | null>(null);

  const rooms = useLiveQuery(() => db.rooms.toArray()) || [];
  const furnitureCount = useLiveQuery(() => db.furniture.count()) || 0;
  const itemsCount = useLiveQuery(() => db.items.count()) || 0;

  // Initialize API key and auto-sync setting on mount/open
  useEffect(() => {
    if (isApiSyncModalOpen) {
      setApiKey(getWorkspaceApiKey());
      setAutoSync(isAutoSyncEnabled());
      setImportStatus(null);
      setSyncFeedback(null);
    }
  }, [isApiSyncModalOpen]);

  // Periodic Auto-Sync if enabled
  useEffect(() => {
    if (!autoSync) return;
    const interval = setInterval(async () => {
      try {
        await pullRemoteToLocal();
        setLastSyncTime(new Date().toLocaleTimeString());
      } catch (err) {
        console.error('Auto-sync poll error:', err);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [autoSync]);

  if (!isApiSyncModalOpen) return null;

  const endpointUrl = `${API_BASE_URL}/v1/ai/index`;

  // Sample prompt for Vision LLM
  const visionPrompt = `You are a spatial inventory scanner for Placemend.
Look at this photo of my room and index all detected furniture, storage compartments, and items.
Output strictly valid JSON:
{
  "roomName": "Living Room",
  "furniture": [
    {
      "name": "Tall Bookshelf",
      "type": "bookshelf",
      "dimension": { "width": 4, "length": 2, "height": 180 },
      "color": "#854d0e",
      "containers": [
        {
          "name": "Top Shelf",
          "type": "shelf",
          "items": [
            { "name": "Hardcover Books", "quantity": 6, "category": "Books", "tags": ["reading"] }
          ]
        }
      ]
    }
  ]
}`;

  // Sample cURL command
  const sampleCurl = `curl -X POST "${endpointUrl}" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${apiKey}" \\
  -d '{
    "roomId": "${selectedRoomId || 'room-living'}",
    "furniture": [
      {
        "name": "Modern Work Desk",
        "type": "desk",
        "dimension": { "width": 5, "length": 3 },
        "containers": [
          {
            "name": "Desktop Surface",
            "type": "top_surface",
            "items": [
              { "name": "UltraWide Monitor", "quantity": 1, "category": "Electronics", "tags": ["monitor", "work"] },
              { "name": "Mechanical Keyboard", "quantity": 1, "category": "Electronics", "tags": ["keyboard"] }
            ]
          }
        ]
      }
    ]
  }'`;

  // Handlers
  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(endpointUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(visionPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleCopyCurl = () => {
    navigator.clipboard.writeText(sampleCurl);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  const handleRegenerateKey = () => {
    if (window.confirm('Generate a new API Key? External scripts using the previous key will need to be updated.')) {
      const newKey = generateNewApiKey();
      setApiKey(newKey);
    }
  };

  const handleSaveCustomKey = (newKey: string) => {
    setApiKey(newKey);
    setWorkspaceApiKey(newKey);
  };

  const handleToggleAutoSync = () => {
    const next = !autoSync;
    setAutoSync(next);
    setAutoSyncEnabled(next);
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const res = await syncBidirectional(apiKey);
      if (res.success) {
        setLastSyncTime(new Date().toLocaleTimeString());
        setSyncFeedback({ success: true, text: res.message || 'Synced successfully with server!' });
      } else {
        setSyncFeedback({ success: false, text: res.error || 'Sync failed.' });
      }
    } catch (err: any) {
      setSyncFeedback({ success: false, text: err.message || 'Network error during sync.' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePushOnly = async () => {
    setIsSyncing(true);
    try {
      const res = await pushLocalToRemote(apiKey);
      setSyncFeedback({ 
        success: res.success, 
        text: res.success ? `Pushed ${res.stats?.furniture} furniture & ${res.stats?.items} items to cloud!` : res.error 
      });
      if (res.success) setLastSyncTime(new Date().toLocaleTimeString());
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePullOnly = async () => {
    setIsSyncing(true);
    try {
      const res = await pullRemoteToLocal(apiKey);
      setSyncFeedback({ 
        success: res.success, 
        text: res.success ? `Pulled latest data from cloud!` : res.error 
      });
      if (res.success) setLastSyncTime(new Date().toLocaleTimeString());
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLoadSampleJson = () => {
    const sample = {
      roomId: targetRoom === 'current' ? selectedRoomId : targetRoom,
      furniture: [
        {
          name: "Smart Bookshelf",
          type: "bookshelf",
          dimension: { width: 4, length: 2, height: 180 },
          color: "#854d0e",
          notes: "Detected along north wall",
          containers: [
            {
              name: "Top Shelf",
              type: "shelf",
              items: [
                { name: "Sci-Fi Paperback Collection", quantity: 6, category: "Books", tags: ["fiction", "reading"] },
                { name: "Vintage Brass Compass", quantity: 1, category: "Decor", tags: ["vintage", "brass"] }
              ]
            },
            {
              name: "Middle Shelf",
              type: "shelf",
              items: [
                { name: "Camera Equipment Case", quantity: 1, category: "Tech", tags: ["camera", "photography"] },
                { name: "Board Game Box", quantity: 2, category: "Entertainment", tags: ["games"] }
              ]
            }
          ]
        },
        {
          name: "Adjustable Desk",
          type: "desk",
          dimension: { width: 5, length: 3, height: 75 },
          color: "#334155",
          containers: [
            {
              name: "Main Desktop",
              type: "top_surface",
              items: [
                { name: "4K Gaming Monitor", quantity: 1, category: "Electronics", tags: ["display", "work"] },
                { name: "Wireless Mechanical Keyboard", quantity: 1, category: "Electronics", tags: ["keyboard"] }
              ]
            },
            {
              name: "Right Drawer",
              type: "drawer",
              items: [
                { name: "Braided USB-C Cables", quantity: 3, category: "Cables", tags: ["usb-c", "charging"] },
                { name: "Sticky Notes & Markers", quantity: 1, category: "Stationery", tags: ["office"] }
              ]
            }
          ]
        }
      ]
    };
    setJsonInput(JSON.stringify(sample, null, 2));
  };

  const handleImportJson = async () => {
    if (!jsonInput.trim()) {
      setImportStatus({ success: false, message: 'Please paste JSON data first.' });
      return;
    }

    try {
      const parsed = JSON.parse(jsonInput);
      if (targetRoom !== 'current' && targetRoom !== 'auto') {
        parsed.roomId = targetRoom;
      } else if (targetRoom === 'current' && selectedRoomId) {
        parsed.roomId = selectedRoomId;
      }

      setIsSubmitting(true);
      setImportStatus(null);

      const res = await submitAiPayload(parsed, apiKey);
      if (res.success) {
        setImportStatus({ success: true, message: res.message });
        setJsonInput('');
        setLastSyncTime(new Date().toLocaleTimeString());
      } else {
        setImportStatus({ success: false, message: res.error || 'Failed to import payload.' });
      }
    } catch (err: any) {
      setImportStatus({ success: false, message: 'JSON syntax error: ' + err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm select-none animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="px-5 py-4 bg-white text-slate-900 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shadow-xs">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>AI Room Indexing & API Sync</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-bold border border-indigo-200">
                  REST API v1
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Populate your room with AI vision models, mobile shortcuts, or scripts
              </p>
            </div>
          </div>
          <button
            onClick={() => setApiSyncModalOpen(false)}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            title="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-4 pt-2 gap-2 text-xs font-bold">
          <button
            onClick={() => setActiveTab('api')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg transition-all cursor-pointer border-b-2 -mb-[1px] ${
              activeTab === 'api'
                ? 'border-blue-600 text-blue-600 bg-white shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>API & Vision Setup</span>
          </button>

          <button
            onClick={() => setActiveTab('import')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg transition-all cursor-pointer border-b-2 -mb-[1px] ${
              activeTab === 'import'
                ? 'border-blue-600 text-blue-600 bg-white shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Direct AI Paste</span>
          </button>

          <button
            onClick={() => setActiveTab('sync')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg transition-all cursor-pointer border-b-2 -mb-[1px] ${
              activeTab === 'sync'
                ? 'border-blue-600 text-blue-600 bg-white shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>Cloud & Auto-Sync</span>
            {autoSync && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
          </button>
        </div>

        {/* Tab 1: API & Vision Setup */}
        {activeTab === 'api' && (
          <div className="p-5 overflow-y-auto space-y-4 text-xs">
            
            {/* Workspace API Key */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span>Your Workspace API Key</span>
                </span>
                <button
                  onClick={handleRegenerateKey}
                  className="text-[11px] text-slate-500 hover:text-rose-600 flex items-center gap-1 font-semibold transition-colors cursor-pointer"
                  title="Generate a new random key"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Regenerate</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => handleSaveCustomKey(e.target.value)}
                  className="flex-1 font-mono text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-blue-500 select-all"
                />
                <button
                  onClick={handleCopyKey}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95"
                >
                  {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Pass this key via header <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-slate-800">X-API-Key: {apiKey}</code> or query param <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-slate-800">?key={apiKey}</code>.
              </p>
            </div>

            {/* REST Endpoint URL */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <Code className="w-3.5 h-3.5 text-blue-600" />
                <span>AI Ingestion Endpoint (POST)</span>
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={endpointUrl}
                  className="flex-1 font-mono text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 select-all"
                />
                <button
                  onClick={handleCopyUrl}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95"
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedUrl ? 'Copied' : 'Copy URL'}</span>
                </button>
              </div>
            </div>

            {/* Quick Actions / Integration Templates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                onClick={handleCopyPrompt}
                className="p-3 rounded-xl border border-blue-200 bg-blue-50/60 hover:bg-blue-100/80 text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between font-bold text-blue-900 mb-1">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    <span>Copy Vision AI Prompt</span>
                  </span>
                  {copiedPrompt ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-blue-500 group-hover:text-blue-700" />}
                </div>
                <p className="text-[11px] text-blue-700 leading-relaxed">
                  Optimized for ChatGPT, Claude, and Gemini Vision. Paste this with your room photos to get instant Placemend JSON.
                </p>
              </button>

              <button
                onClick={handleCopyCurl}
                className="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between font-bold text-slate-800 mb-1">
                  <span className="flex items-center gap-1.5">
                    <Code className="w-3.5 h-3.5 text-slate-600" />
                    <span>Copy cURL Command</span>
                  </span>
                  {copiedCurl ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500 group-hover:text-slate-700" />}
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Terminal command ready to post sample furniture and items directly into your room.
                </p>
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Direct AI Import (Paste JSON) */}
        {activeTab === 'import' && (
          <div className="p-5 overflow-y-auto space-y-3.5 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800">Paste AI Detection JSON</span>
                <p className="text-[11px] text-slate-500">
                  Paste the JSON received from your AI vision model or external agent below.
                </p>
              </div>
              <button
                onClick={handleLoadSampleJson}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] border border-slate-200 transition-colors cursor-pointer"
              >
                Load Sample Payload
              </button>
            </div>

            {/* Target Room Selector */}
            <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <span className="font-semibold text-slate-600 flex-shrink-0">Target Room:</span>
              <select
                value={targetRoom}
                onChange={(e) => setTargetRoom(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800 font-bold focus:outline-none cursor-pointer flex-1"
              >
                <option value="current">Current Active Room ({rooms.find(r => r.id === selectedRoomId)?.name || 'Active'})</option>
                <option value="auto">Auto-detect or Create from JSON</option>
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            {/* JSON Textarea */}
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder={`{\n  "furniture": [\n    {\n      "name": "Oak Bookshelf",\n      "type": "bookshelf",\n      "containers": [\n        {\n          "name": "Top Shelf",\n          "items": [{ "name": "Books", "quantity": 5 }]\n        }\n      ]\n    }\n  ]\n}`}
              rows={9}
              className="w-full font-mono text-xs bg-slate-900 text-emerald-400 p-3 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 select-text"
            />

            {/* Import Status Feedback */}
            {importStatus && (
              <div className={`p-3 rounded-xl flex items-center gap-2 text-xs font-semibold ${
                importStatus.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}>
                {importStatus.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />}
                <span>{importStatus.message}</span>
              </div>
            )}

            {/* Action Button */}
            <button
              onClick={handleImportJson}
              disabled={isSubmitting || !jsonInput.trim()}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer active:scale-98"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing Spatial Placement...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Import Detected Objects into Placemend</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Tab 3: Cloud & Auto-Sync */}
        {activeTab === 'sync' && (
          <div className="p-5 overflow-y-auto space-y-4 text-xs">
            
            {/* Sync State Card */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-bold text-slate-800 text-sm">Cloud Workspace Sync</span>
                </div>
                {lastSyncTime && (
                  <span className="text-[11px] text-slate-500 font-medium">
                    Last synced: <span className="font-mono font-bold text-slate-700">{lastSyncTime}</span>
                  </span>
                )}
              </div>

              {/* Local Counts */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-lg bg-white border border-slate-200">
                  <div className="text-base font-black text-slate-800">{rooms.length}</div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Rooms</div>
                </div>
                <div className="p-2 rounded-lg bg-white border border-slate-200">
                  <div className="text-base font-black text-slate-800">{furnitureCount}</div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Furniture</div>
                </div>
                <div className="p-2 rounded-lg bg-white border border-slate-200">
                  <div className="text-base font-black text-slate-800">{itemsCount}</div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Items</div>
                </div>
              </div>

              {/* Auto Sync Toggle */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <div>
                  <span className="font-bold text-slate-700">Live Auto-Sync (Every 15s)</span>
                  <p className="text-[11px] text-slate-500">
                    Automatically pull updates when external AI models index objects.
                  </p>
                </div>
                <button
                  onClick={handleToggleAutoSync}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                    autoSync ? 'bg-blue-600 justify-end' : 'bg-slate-300 justify-start'
                  }`}
                >
                  <div className="bg-white w-4 h-4 rounded-full shadow-md transform transition-transform" />
                </button>
              </div>
            </div>

            {/* Sync Feedback Alert */}
            {syncFeedback && (
              <div className={`p-3 rounded-xl flex items-center gap-2 text-xs font-semibold ${
                syncFeedback.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}>
                {syncFeedback.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />}
                <span>{syncFeedback.text}</span>
              </div>
            )}

            {/* Sync Action Buttons */}
            <div className="space-y-2">
              <button
                onClick={handleSyncNow}
                disabled={isSyncing}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer active:scale-98"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Syncing with Cloud...' : 'Sync Now (Bidirectional Push & Pull)'}</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handlePushOnly}
                  disabled={isSyncing}
                  className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center gap-1.5 border border-slate-200 transition-colors cursor-pointer"
                  title="Upload all local furniture and items to cloud"
                >
                  <Upload className="w-3.5 h-3.5 text-blue-600" />
                  <span>Push to Cloud</span>
                </button>

                <button
                  onClick={handlePullOnly}
                  disabled={isSyncing}
                  className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center gap-1.5 border border-slate-200 transition-colors cursor-pointer"
                  title="Download and merge latest items from cloud"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Pull from Cloud</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="font-semibold">Placemend Spatial AI Engine</span>
          </div>
          <button
            onClick={() => setApiSyncModalOpen(false)}
            className="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
