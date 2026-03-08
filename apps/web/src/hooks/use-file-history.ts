import { useCallback, useMemo, useState } from "react";

interface NavigationState {
  stack: string[];
  index: number;
}

export function useFileHistory(rootFolderId: string, onNavigate?: () => void) {
  const [navState, setNavState] = useState<NavigationState>({
    stack: [rootFolderId],
    index: 0,
  });

  const currentFolderId = useMemo(() => navState.stack[navState.index], [navState]);

  const navigateTo = useCallback(
    (folderId: string) => {
      setNavState((previous) => {
        if (previous.stack[previous.index] === folderId) {
          return previous;
        }

        const nextStack = previous.stack.slice(0, previous.index + 1);
        nextStack.push(folderId);
        return { stack: nextStack, index: nextStack.length - 1 };
      });
      onNavigate?.();
    },
    [onNavigate],
  );

  const navigateBack = useCallback(() => {
    setNavState((previous) => {
      if (previous.index === 0) {
        return previous;
      }
      return { ...previous, index: previous.index - 1 };
    });
    onNavigate?.();
  }, [onNavigate]);

  const navigateForward = useCallback(() => {
    setNavState((previous) => {
      if (previous.index >= previous.stack.length - 1) {
        return previous;
      }
      return { ...previous, index: previous.index + 1 };
    });
    onNavigate?.();
  }, [onNavigate]);

  return {
    navState,
    currentFolderId,
    navigateTo,
    navigateBack,
    navigateForward,
  };
}
