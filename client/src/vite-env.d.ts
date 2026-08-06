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
  };
}
