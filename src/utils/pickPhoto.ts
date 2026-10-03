// Android shows either the camera (capture attribute) or only the gallery (without it), never both.
// So every photo button first asks which one, then opens the file input the right way.

export function pickPhoto(input: HTMLInputElement | null | undefined): void {
  if (!input) return;
  document.getElementById('pm-photo-chooser')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'pm-photo-chooser';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Add a photo');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:100;background:rgba(15,23,42,.45);display:flex;align-items:flex-end;justify-content:center';

  const sheet = document.createElement('div');
  sheet.style.cssText =
    'width:100%;max-width:420px;background:#fff;border-radius:24px 24px 0 0;padding:16px 16px max(env(safe-area-inset-bottom),16px);display:flex;flex-direction:column;gap:10px;font-family:inherit';

  const close = () => overlay.remove();
  const button = (label: string, primary: boolean, onClick: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = `min-height:52px;border-radius:16px;border:0;font-size:15px;font-weight:700;cursor:pointer;${
      primary ? 'background:#2563eb;color:#fff' : 'background:#f1f5f9;color:#334155'
    }`;
    b.addEventListener('click', onClick);
    return b;
  };
  const open = (camera: boolean) => {
    if (camera) input.setAttribute('capture', 'environment');
    else input.removeAttribute('capture');
    close();
    input.click(); // still inside the tap, so the browser allows it
  };

  sheet.append(
    button('📷  Take photo', true, () => open(true)),
    button('🖼️  Choose from gallery', true, () => open(false)),
    button('Cancel', false, close)
  );
  overlay.append(sheet);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.body.append(overlay);
}
