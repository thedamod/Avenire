import { useRef, type RefObject } from "react";

/**
 * Provides refs and a helper to scroll a container to its bottom.
 *
 * Attach the first ref to the scrolling container and the second ref to a sentinel element placed at the container's end; calling the returned function smoothly brings the sentinel into view.
 *
 * @returns A tuple `[containerRef, endRef, scroll]` where `containerRef` is a ref for the scrolling container, `endRef` is a ref for the bottom sentinel element, and `scroll` moves the sentinel into view with smooth behavior.
 */
export function useScrollToBottom<T extends HTMLElement>(): [
  RefObject<T | null>,
  RefObject<T | null>,
  () => void,
] {
  const containerRef = useRef<T>(null);
  const endRef = useRef<T>(null);

  const scroll = () => {
    const container = containerRef.current;
    const end = endRef.current;
    if (container && end) {
      end.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  return [containerRef, endRef, scroll];
}
