// What this device is showing: the demo apartment, or the user's own home.
// The demo is only ever created on request, and is never synced into an account.

export type AppMode = 'demo' | 'own';
export type OnboardingStep = 'welcome' | 'account' | 'room' | 'furniture' | 'done';

const MODE_KEY = 'placemend_mode';
const STEP_KEY = 'placemend_onboarding';

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
};

export const getAppMode = (): AppMode | null => {
  const v = read(MODE_KEY);
  return v === 'demo' || v === 'own' ? v : null;
};
export const setAppMode = (m: AppMode | null) => write(MODE_KEY, m);

export const getOnboardingStep = (): OnboardingStep | null => {
  const v = read(STEP_KEY);
  return v === 'welcome' || v === 'account' || v === 'room' || v === 'furniture' || v === 'done' ? v : null;
};
export const setOnboardingStep = (s: OnboardingStep | null) => write(STEP_KEY, s);
