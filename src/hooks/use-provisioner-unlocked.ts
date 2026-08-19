"use client";

import { useSyncExternalStore, useCallback } from "react";

const STORAGE_KEY = "meetlog_provisioner_unlocked_until";
const EVENT_NAME = "meetlog:provisioner-unlocked-change";
const UNLOCK_DURATION_MS = 5 * 60 * 1000;

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  window.addEventListener(EVENT_NAME, callback);
  window.addEventListener("storage", callback);

  const intervalId = setInterval(() => {
    try {
      const expiryStr = localStorage.getItem(STORAGE_KEY);
      if (expiryStr) {
        const expiry = Number(expiryStr);
        if (Date.now() >= expiry) {
          localStorage.removeItem(STORAGE_KEY);
          callback();
          window.dispatchEvent(new Event(EVENT_NAME));
        }
      }
    } catch {
    }
  }, 1000);

  return () => {
    window.removeEventListener(EVENT_NAME, callback);
    window.removeEventListener("storage", callback);
    clearInterval(intervalId);
  };
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const expiryStr = localStorage.getItem(STORAGE_KEY);
    if (!expiryStr) return false;
    const expiry = Number(expiryStr);
    return !isNaN(expiry) && expiry > Date.now();
  } catch {
    return false;
  }
}

function getServerSnapshot(): boolean {
  return false;
}

export function useProvisionerUnlocked(): [boolean, (val?: boolean) => void] {
  const isUnlocked = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const unlockOrSet = useCallback((forcedVal?: boolean) => {
    if (typeof window === "undefined") return;
    try {
      const isCurrentlyUnlocked = getSnapshot();
      const shouldUnlock = forcedVal !== undefined ? forcedVal : !isCurrentlyUnlocked;

      if (shouldUnlock) {
        const expiresAt = Date.now() + UNLOCK_DURATION_MS;
        localStorage.setItem(STORAGE_KEY, String(expiresAt));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }

      window.dispatchEvent(new Event(EVENT_NAME));
    } catch {
    }
  }, []);

  return [isUnlocked, unlockOrSet];
}
