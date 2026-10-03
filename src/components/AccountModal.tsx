import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { db } from '../db/database';
import { Room } from '../types';
import { seedDemoDataIfEmpty } from '../db/sampleData';
import { 
  loginWithGoogleToken, 
  loginWithDemoAccount, 
  logout, 
  getGoogleClientId, 
  setGoogleClientId,
  fetchCurrentUser,
  isConfiguredGoogleClientId,
  fetchServerAuthConfig,
  saveServerAuthConfig
} from '../services/auth';
import { 
  syncBidirectional, 
  pullRemoteToLocal,
  isAutoSyncEnabled, 
  setAutoSyncEnabled 
} from '../services/apiSync';
import { History, 
  X, 
  User, 
  LogOut, 
  Cloud, 
  RefreshCw, 
  CheckCircle2, 
  Sparkles, 
  Download, 
  ShieldCheck, 
  Settings, 
  ChevronRight, 
  AlertCircle, 
  ExternalLink 
} from 'lucide-react';

export const AccountModal: React.FC = () => {
  const { 
    isAccountModalOpen, 
    setAccountModalOpen, 
    currentUser, 
    setCurrentUser,
    selectedRoomId,
    setSelectedRoomId,
    setApiSyncModalOpen,
    setBackupModalOpen 
  } = useAppStore();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [autoSync, setAutoSync] = useState(isAutoSyncEnabled());
  const [customClientId, setCustomClientId] = useState(getGoogleClientId());
  const [showInstructions, setShowInstructions] = useState(false);
  const [showCustomProfile, setShowCustomProfile] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [copiedOrigin, setCopiedOrigin] = useState(false);

  const googleBtnRef = useRef<HTMLDivElement>(null);
  const isGoogleConfigured = isConfiguredGoogleClientId(customClientId);

  // Sync state on open
  useEffect(() => {
    if (isAccountModalOpen) {
      setError(null);
      setSyncStatus(null);
      setAutoSync(isAutoSyncEnabled());
      // Refresh auth config from server
      fetchServerAuthConfig().then((cid) => {
        if (cid) setCustomClientId(cid);
      }).catch(() => {});
      // Refresh current user session from server and sync workspace
      fetchCurrentUser().then(async (u) => {
        if (u) {
          setCurrentUser(u);
          if (u.workspaceKey) {
            await pullRemoteToLocal(u.workspaceKey);
          }
        }
      }).catch(() => {});
    }
  }, [isAccountModalOpen, setCurrentUser]);

  // Initialize Google Identity Services button ONLY if client ID is properly configured
  useEffect(() => {
    if (!isAccountModalOpen || currentUser) {
      if (googleBtnRef.current) {
        googleBtnRef.current.innerHTML = '';
      }
      return;
    }

    const clientId = customClientId || getGoogleClientId();
    if (!isConfiguredGoogleClientId(clientId)) {
      if (googleBtnRef.current) {
        googleBtnRef.current.innerHTML = '';
      }
      return;
    }

    let isMounted = true;
    let attempts = 0;

    const renderGoogleBtn = () => {
      if (!isMounted) return;
      const google = (window as unknown as { google?: { accounts?: { id?: {
        initialize: (config: { client_id: string; callback: (res: { credential?: string }) => void }) => void;
        renderButton: (parent: HTMLElement, options: { theme?: string; size?: string; width?: string | number; text?: string; shape?: string }) => void;
      } } } }).google;

      if (google?.accounts?.id && googleBtnRef.current) {
        try {
          google.accounts.id.initialize({
            client_id: clientId,
            callback: async (response) => {
              if (response.credential) {
                setIsLoading(true);
                setError(null);
                try {
                  const user = await loginWithGoogleToken(response.credential);
                  setCurrentUser(user);
                  setAutoSync(true);
                  setAutoSyncEnabled(true);
                  await pullRemoteToLocal(user.workspaceKey, true);
                  await syncBidirectional(user.workspaceKey);
                  setSyncStatus('Workspace synced with Google account!');
                  const loadedRooms = await db.rooms.toArray();
                  if (loadedRooms.length > 0 && (!selectedRoomId || !loadedRooms.some((r: Room) => r.id === selectedRoomId))) {
                    setSelectedRoomId(loadedRooms[0].id);
                  }
                } catch (err: unknown) {
                  setError((err as Error).message || 'Failed to sign in with Google');
                } finally {
                  setIsLoading(false);
                }
              }
            }
          });

          googleBtnRef.current.innerHTML = '';
          google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'outline',
            size: 'large',
            width: 320,
            text: 'continue_with',
            shape: 'rectangular'
          });
        } catch (err) {
          console.warn('Google Identity button render error:', err);
        }
      } else if (attempts < 20) {
        attempts++;
        setTimeout(renderGoogleBtn, 150);
      }
    };

    renderGoogleBtn();

    return () => {
      isMounted = false;
    };
  }, [isAccountModalOpen, currentUser, customClientId, setCurrentUser]);

  if (!isAccountModalOpen) return null;

  const handleDemoSignIn = async (name?: string, email?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const finalName = name || customName.trim() || 'Demo Architect';
      const finalEmail = email || customEmail.trim() || 'architect@freshcoders.nl';
      const user = await loginWithDemoAccount(finalName, finalEmail);
      setCurrentUser(user);
      await syncBidirectional();
      setSyncStatus(`Connected as ${user.email} & workspace synced!`);
    } catch (err: unknown) {
      setError((err as Error).message || 'Sign in error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await logout();
      setCurrentUser(null);
      setSyncStatus(null);
      await seedDemoDataIfEmpty();
      const all = await db.rooms.toArray();
      if (all.length > 0) {
        setSelectedRoomId(all[0].id);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSync = async () => {
    setIsLoading(true);
    setSyncStatus(null);
    try {
      const key = currentUser?.workspaceKey;
      await pullRemoteToLocal(key);
      const res = await syncBidirectional(key);
      setSyncStatus(res.message || 'Workspace synchronized with cloud!');
      const loadedRooms = await db.rooms.toArray();
      if (loadedRooms.length > 0 && (!selectedRoomId || !loadedRooms.some((r: Room) => r.id === selectedRoomId))) {
        setSelectedRoomId(loadedRooms[0].id);
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Sync failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleAutoSync = () => {
    const next = !autoSync;
    setAutoSync(next);
    setAutoSyncEnabled(next);
  };

  const handleSaveClientId = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customClientId.trim();
    if (!trimmed) {
      setError('Please enter a Google OAuth Client ID');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await saveServerAuthConfig(trimmed);
      setGoogleClientId(trimmed);
      setSyncStatus('Google OAuth Client ID saved on server!');
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to save configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyOrigin = () => {
    navigator.clipboard.writeText('https://freshcoders.nl');
    setCopiedOrigin(true);
    setTimeout(() => setCopiedOrigin(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm select-none animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 font-bold">
              {currentUser?.picture ? (
                <img 
                  src={currentUser.picture} 
                  alt={currentUser.name} 
                  className="w-full h-full rounded-2xl object-cover" 
                />
              ) : (
                <User className="w-5 h-5 text-white" />
              )}
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                {currentUser ? 'User Account' : 'Sign In to Placemend'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {currentUser ? currentUser.email : 'Sync rooms and layouts across all your devices'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setAccountModalOpen(false)}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 custom-scrollbar flex-1 text-slate-800">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-xs text-red-700 font-semibold">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {syncStatus && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 text-xs text-emerald-800 font-bold">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
              <span>{syncStatus}</span>
            </div>
          )}

          {/* Logged Out State */}
          {!currentUser ? (
            <div key="auth-logged-out" className="space-y-4">
              <div className="bg-gradient-to-br from-blue-50/70 to-indigo-50/40 p-4 rounded-2xl border border-blue-100 flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-2xl bg-white shadow-md flex items-center justify-center mb-2.5 text-blue-600">
                  <Cloud className="w-6 h-6 stroke-[2.5]" />
                </div>
                <h4 className="font-extrabold text-sm text-slate-900 mb-1">
                  Automatic Multi-Device Cloud Sync
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed max-w-xs">
                  Create an account or sign in to store, backup, and sync your architectural floor plans and furniture collections anywhere.
                </p>
              </div>

              {/* When Official Google OAuth is properly configured */}
              {isGoogleConfigured ? (
                <div className="flex flex-col items-center gap-3 pt-1">
                  <div className="w-full flex justify-center py-1">
                    <div ref={googleBtnRef} className="min-h-[44px] flex items-center justify-center" />
                  </div>

                </div>
              ) : (
                /* When Google OAuth needs setup / unconfigured */
                <div className="space-y-3 pt-1">
                  {/* Instant Sign-in (Always available immediately) */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h5 className="font-extrabold text-xs text-slate-900">Instant Cloud Access</h5>
                        <p className="text-[11px] text-slate-500 font-medium">Start syncing your rooms immediately</p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wide">
                        Ready
                      </span>
                    </div>

                    {!showCustomProfile ? (
                      <div className="space-y-2">
                        <button
                          onClick={() => handleDemoSignIn()}
                          disabled={isLoading}
                          className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all cursor-pointer active:scale-98"
                        >
                          <Cloud className="w-4 h-4" />
                          <span>{isLoading ? 'Connecting...' : 'Sign In with 1-Click'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowCustomProfile(true)}
                          className="w-full text-center text-[11px] font-bold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                        >
                          Or specify custom name & email
                        </button>
                      </div>
                    ) : (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleDemoSignIn(customName, customEmail);
                        }}
                        className="space-y-2 pt-1"
                      >
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Your Name</label>
                          <input
                            type="text"
                            value={customName}
                            onChange={(e) => setCustomName(e.target.value)}
                            placeholder="e.g. Alex Architect"
                            className="w-full bg-white text-slate-900 text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Email Address</label>
                          <input
                            type="email"
                            value={customEmail}
                            onChange={(e) => setCustomEmail(e.target.value)}
                            placeholder="e.g. alex@example.com"
                            className="w-full bg-white text-slate-900 text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs shadow-xs cursor-pointer"
                          >
                            Sign In / Create Account
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowCustomProfile(false)}
                            className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-bold text-xs cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </div>

                  {/* Connect Official Google OAuth Setup Card */}
                  <div className="p-3.5 bg-amber-50/50 border border-amber-200/80 rounded-2xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                        </svg>
                        <h5 className="font-extrabold text-xs text-amber-950">Official Google Sign-In Setup</h5>
                      </div>
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                        Setup Required
                      </span>
                    </div>

                    <p className="text-[11px] text-amber-900 leading-relaxed font-medium">
                      Google OAuth requires a registered Client ID for origin <code className="bg-amber-100/80 px-1 py-0.5 rounded text-amber-950 font-bold">https://freshcoders.nl</code> to prevent 401 errors.
                    </p>

                    <button
                      type="button"
                      onClick={() => setShowInstructions(!showInstructions)}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                    >
                      <span>{showInstructions ? 'Hide setup instructions' : 'How to get Google Client ID (3 steps)'}</span>
                      <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showInstructions ? 'rotate-90' : ''}`} />
                    </button>

                    {showInstructions && (
                      <div className="p-3 bg-white rounded-xl border border-amber-200 text-xs text-slate-700 space-y-2">
                        <div className="space-y-1">
                          <span className="font-bold text-slate-900">1. Open Google Cloud Console:</span>
                          <p className="text-[11px] text-slate-600">
                            Go to{' '}
                            <a
                              href="https://console.cloud.google.com/apis/credentials"
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 underline font-semibold inline-flex items-center gap-0.5"
                            >
                              Credentials Console <ExternalLink className="w-2.5 h-2.5 inline" />
                            </a>
                          </p>
                        </div>
                        <div className="space-y-1">
                          <span className="font-bold text-slate-900">2. Create OAuth Client ID:</span>
                          <p className="text-[11px] text-slate-600">
                            Click <span className="font-semibold text-slate-800">Create Credentials</span> → <span className="font-semibold text-slate-800">OAuth client ID</span> → Application type: <span className="font-semibold text-slate-800">Web application</span>.
                          </p>
                        </div>
                        <div className="space-y-1">
                          <span className="font-bold text-slate-900">3. Add Authorized JavaScript origin:</span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <code className="bg-slate-100 px-2 py-1 rounded text-[11px] font-mono text-slate-800 select-all border border-slate-200">
                              https://freshcoders.nl
                            </code>
                            <button
                              type="button"
                              onClick={handleCopyOrigin}
                              className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold rounded cursor-pointer"
                            >
                              {copiedOrigin ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1">
                            (Optional for local dev: also add <code className="font-mono">http://localhost:5173</code>)
                          </p>
                        </div>
                        <div className="space-y-1">
                          <span className="font-bold text-slate-900">4. Copy & Paste Client ID below:</span>
                        </div>
                      </div>
                    )}

                    {/* Client ID input form */}
                    <form onSubmit={handleSaveClientId} className="space-y-2 pt-1">
                      <input
                        type="text"
                        value={customClientId}
                        onChange={(e) => setCustomClientId(e.target.value)}
                        placeholder="e.g. 123456789-xxx.apps.googleusercontent.com"
                        className="w-full bg-white text-slate-900 text-xs px-2.5 py-2 rounded-xl border border-amber-300 font-mono shadow-xs focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shadow-xs cursor-pointer active:scale-98 transition-all"
                      >
                        {isLoading ? 'Saving...' : 'Save & Enable Google Sign-In'}
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Logged In Profile State */
            <div key="auth-logged-in" className="space-y-4">
              {/* User Profile Card */}
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-sm flex-shrink-0">
                    {currentUser.picture ? (
                      <img 
                        src={currentUser.picture} 
                        alt={currentUser.name} 
                        className="w-full h-full rounded-2xl object-cover" 
                      />
                    ) : (
                      <User className="w-6 h-6 text-white" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-extrabold text-sm text-slate-900 truncate">
                        {currentUser.name}
                      </h4>
                      <ShieldCheck className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    </div>
                    <p className="text-xs text-slate-500 truncate font-medium">
                      {currentUser.email}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleLogout}
                  disabled={isLoading}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer flex-shrink-0"
                  title="Sign Out"
                >
                  <LogOut className="w-4.5 h-4.5" />
                </button>
              </div>

              {/* Cloud Sync Status */}
              <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-bold text-slate-900">Cloud Sync Active</span>
                  </div>
                  <button
                    onClick={handleManualSync}
                    disabled={isLoading}
                    className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-700 rounded-lg text-xs font-bold border border-blue-200 transition-all cursor-pointer shadow-xs active:scale-95"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    <span>Sync Now</span>
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-blue-100/80">
                  <span className="text-slate-600 font-medium">Automatic Background Sync</span>
                  <button
                    onClick={handleToggleAutoSync}
                    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                      autoSync ? 'bg-blue-600' : 'bg-slate-300'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-0.5 ${
                      autoSync ? 'left-4.5' : 'left-0.5'
                    }`} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Secondary Navigation Tools (available signed in or out) */}
          <div className="space-y-1.5 pt-4">
            <label className="block text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider px-1">
              Tools & Data
            </label>

            {/* Cloud & AI Tools Launcher */}
            <button
              onClick={() => {
                setAccountModalOpen(false);
                setApiSyncModalOpen(true);
              }}
              className="w-full p-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition-all flex items-center justify-between text-left cursor-pointer group shadow-xs"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                    AI Vision Scanner & API
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Photo room scanning and developer API endpoints
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-transform group-hover:translate-x-0.5" />
            </button>

            {/* Change history */}
            <button
              onClick={() => {
                setAccountModalOpen(false);
                useAppStore.getState().setHistoryView({ recordId: null });
              }}
              className="w-full p-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition-all flex items-center justify-between text-left cursor-pointer group shadow-xs"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                    Change history
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium">
                    What changed, by whom (app, ChatGPT, Claude), with undo
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-transform group-hover:translate-x-0.5" />
            </button>

            {/* Backup & Export Data Launcher */}
            <button
              onClick={() => {
                setAccountModalOpen(false);
                setBackupModalOpen(true);
              }}
              className="w-full p-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition-all flex items-center justify-between text-left cursor-pointer group shadow-xs"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                    Backup & Export Layouts (JSON)
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Export local database backup or transfer files
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
