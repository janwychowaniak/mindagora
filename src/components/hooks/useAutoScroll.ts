import { useEffect, useRef } from "react";

const BOTTOM_THRESHOLD_PX = 32;

// Returns a ref for a scrolling container and keeps it pinned to the bottom when `signal` changes, but only
// if the user was already at the bottom (US-024: never interrupt someone reading history). The first fill
// always scrolls down.
export function useAutoScroll<T extends HTMLElement>(signal: string) {
  const containerRef = useRef<T>(null);
  const atBottomRef = useRef(true);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const handleScroll = () => {
      atBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight <= BOTTOM_THRESHOLD_PX;
    };

    element.addEventListener("scroll", handleScroll, { passive: true });
    return () => element.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || !atBottomRef.current) {
      return;
    }
    element.scrollTo({ top: element.scrollHeight });
  }, [signal]);

  return containerRef;
}
