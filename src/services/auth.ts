import { API_BASE_URL, setWorkspaceApiKey } from './apiSync';

export interface User {
  id: string;
  email: string;
  name: string;
  picture: string;
  workspaceKey: string;
  createdAt: number;
  lastLoginAt: number;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: User;
  workspaceKey?: string;
  error?: string;
}

const TOKEN_KEY = 'placemend_auth_token';
const USER_KEY = 'placemend_user_profile';
const GOOGLE_CLIENT_ID_KEY = 'placemend_google_client_id';

// Official Google OAuth Client ID provided by administrator
const DEFAULT_GOOGLE_CLIENT_ID = '1027558050897-f66h8ehmk2096e5uqi3fgm6ccn0l70f6.apps.googleusercontent.com';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isConfiguredGoogleClientId(id?: string | null): boolean {
  if (!id) return false;
  const trimmed = id.trim();
  return trimmed.length > 20 && !trimmed.includes('sampleclientid') && trimmed.endsWith('.apps.googleusercontent.com');
}

export function getGoogleClientId(): string {
  const stored = localStorage.getItem(GOOGLE_CLIENT_ID_KEY);
  if (stored && isConfiguredGoogleClientId(stored)) {
    return stored.trim();
  }
  return DEFAULT_GOOGLE_CLIENT_ID;
}

export function setGoogleClientId(clientId: string): void {
  localStorage.setItem(GOOGLE_CLIENT_ID_KEY, clientId.trim());
}

export async function fetchServerAuthConfig(): Promise<string> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/config.php`);
    if (res.ok) {
      const data = await res.json();
      if (data.googleClientId && isConfiguredGoogleClientId(data.googleClientId)) {
        localStorage.setItem(GOOGLE_CLIENT_ID_KEY, data.googleClientId.trim());
        return data.googleClientId.trim();
      }
    }
  } catch {}
  return getGoogleClientId();
}

export async function saveServerAuthConfig(clientId: string): Promise<void> {
  localStorage.setItem(GOOGLE_CLIENT_ID_KEY, clientId.trim());
  try {
    await fetch(`${API_BASE_URL}/auth/config.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ googleClientId: clientId.trim() })
    });
  } catch {}
}

/**
 * Sign in using Google ID Token credential
 */
export async function loginWithGoogleToken(credential: string): Promise<User> {
  const res = await fetch(`${API_BASE_URL}/auth/google.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ credential })
  });

  const data: AuthResponse = await res.json();
  if (!res.ok || !data.success || !data.user || !data.token) {
    throw new Error(data.error || 'Google authentication failed');
  }

  // Persist session
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));

  // Automatically link user's private workspace
  if (data.workspaceKey) {
    setWorkspaceApiKey(data.workspaceKey);
  }

  return data.user;
}

/**
 * Sign in with Demo / Guest Google profile (for testing & zero-setup use)
 */
export async function loginWithDemoAccount(name = 'Demo Architect', email = 'architect@placemend.app'): Promise<User> {
  const res = await fetch(`${API_BASE_URL}/auth/google.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ isDemo: true, name, email })
  });

  const data: AuthResponse = await res.json();
  if (!res.ok || !data.success || !data.user || !data.token) {
    throw new Error(data.error || 'Account creation failed');
  }

  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));

  if (data.workspaceKey) {
    setWorkspaceApiKey(data.workspaceKey);
  }

  return data.user;
}

/**
 * Fetch current authenticated user session from server
 */
export async function fetchCurrentUser(): Promise<User | null> {
  const token = getStoredToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/auth/me.php`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      // Token expired or invalid
      logout();
      return null;
    }

    const data = await res.json();
    if (data.authenticated && data.user) {
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      if (data.user.workspaceKey) {
        setWorkspaceApiKey(data.user.workspaceKey);
      }
      return data.user;
    }

    logout();
    return null;
  } catch (err) {
    console.warn('Could not verify session online, using cached profile:', err);
    return getStoredUser();
  }
}

/**
 * Log out and clear session
 */
export async function logout(): Promise<void> {
  const token = getStoredToken();
  if (token) {
    try {
      await fetch(`${API_BASE_URL}/auth/logout.php`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
    } catch {
      // Ignore network errors on logout
    }
  }

  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
