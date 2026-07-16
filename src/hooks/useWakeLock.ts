import { useEffect } from "react";

export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    void navigator.wakeLock
      .request("screen")
      .then((value) => {
        lock = value;
      })
      .catch(() => undefined);
    return () => {
      void lock?.release();
    };
  }, [active]);
}
