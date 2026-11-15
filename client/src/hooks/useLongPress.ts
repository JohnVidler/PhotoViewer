import { useMemo, useRef } from "react";
import type { PointerEvent, MouseEvent } from "react";

const HOLD_MS = 500;
const MOVE_TOLERANCE_PX = 10;

/** True on devices whose primary input is a finger (no hover), where selection starts with a long-press. */
export const touchPrimary = typeof window !== "undefined" && window.matchMedia?.("(hover: none)").matches;

/**
 * Touch long-press detection. When a finger is held still on the element, `onLongPress` fires and the click that
 * follows the release is swallowed (via `shouldSuppressClick`) so it doesn't also open the item.
 */
export function useLongPress(onLongPress: (() => void) | undefined) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  return useMemo(() => {
    const cancel = () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };

    return {
      /** Returns true (once) if the click that is being handled is the tail end of a long-press. */
      consumeLongPress(): boolean {
        const was = fired.current;
        fired.current = false;
        return was;
      },
      handlers: onLongPress
        ? {
            onPointerDown(event: PointerEvent) {
              if (event.pointerType !== "touch") {
                return;
              }
              fired.current = false;
              origin.current = { x: event.clientX, y: event.clientY };
              cancel();
              timer.current = window.setTimeout(() => {
                timer.current = null;
                fired.current = true;
                navigator.vibrate?.(15);
                onLongPress();
              }, HOLD_MS);
            },
            onPointerMove(event: PointerEvent) {
              const start = origin.current;
              if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_TOLERANCE_PX) {
                cancel();
              }
            },
            onPointerUp: cancel,
            onPointerCancel: cancel,
            onPointerLeave: cancel,
            onContextMenu(event: MouseEvent) {
              // Suppress the native long-press menu (save image, open link) on touch screens.
              if (touchPrimary) {
                event.preventDefault();
              }
            },
          }
        : {},
    };
  }, [onLongPress]);
}
