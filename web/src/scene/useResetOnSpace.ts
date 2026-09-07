import { useEffect, useRef, useState } from "react";

/**
 * Listens for the space bar and bumps a token each time it's pressed, which
 * callers use to trigger a "reset all papers to the table" animation. Also
 * invokes `onReset` (e.g. to clear the currently-held paper) immediately.
 */
export function useResetOnSpace(onReset: () => void): number {
  const [token, setToken] = useState(0);
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === "Space") {
        e.preventDefault();
        onResetRef.current();
        setToken((t) => t + 1);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return token;
}
