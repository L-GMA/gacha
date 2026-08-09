/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

type UpdateStatus = {
  state: "checking" | "downloading" | "installing";
  message: string;
  progress?: number;
};

interface Window {
  desktop?: {
    getVersion?: () => Promise<string>;
    onUpdateStatus?: (callback: (status: UpdateStatus) => void) => () => void;
    skipUpdate?: () => void;
    setGlobalPtt?: (payload: {
      code: string;
      enabled: boolean;
    }) => Promise<{ mapped: boolean }>;
    getSound?: (url: string) => Promise<string>;
    onGlobalPtt?: (callback: (down: boolean) => void) => () => void;
  };
  gachaScreen?: {
    pick?: (prefs: { quality: string; fps: number }) => Promise<
      { cancelled: true } | { quality: "720" | "1080"; fps: 30 | 60 | 90 }
    >;
  };
}
