import { useEffect, useState } from "react";

function MinimizeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="5" y="5" width="14" height="14" rx="1.5" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="7" width="12" height="12" rx="1.5" opacity="0.45" />
      <rect x="8" y="4" width="12" height="12" rx="1.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const controls = window.desktop?.windowControls;

  useEffect(() => {
    if (!controls) return;
    void controls.isMaximized().then(setMaximized);
    return controls.onMaximizedChange(setMaximized);
  }, [controls]);

  if (!controls) return null;

  return (
    <div className="titlebar">
      <div className="titlebar-drag" onDoubleClick={controls.toggleMaximize}>
        <span className="titlebar-title">GACHA</span>
      </div>
      <div className="titlebar-controls">
        <button type="button" className="titlebar-btn" title="Свернуть" aria-label="Свернуть" onClick={controls.minimize}>
          <MinimizeIcon />
        </button>
        <button
          type="button"
          className="titlebar-btn"
          title={maximized ? "Восстановить" : "Развернуть"}
          aria-label={maximized ? "Восстановить" : "Развернуть"}
          onClick={controls.toggleMaximize}
        >
          {maximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button type="button" className="titlebar-btn titlebar-close" title="Закрыть" aria-label="Закрыть" onClick={controls.close}>
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
