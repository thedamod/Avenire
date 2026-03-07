import { useCallback, useMemo, useState } from "react";

interface NavigationState {
  stack: string[];
  index: number;
}

/**
 * Manage a folder navigation history starting from the provided root folder.
 *
 * @param rootFolderId - The initial folder ID placed on the history stack.
 * @param onNavigate - Optional callback invoked after any navigation action completes.
 * @returns An object with the current navigation state and navigation actions:
 *   - `navState`: the history stack and current index.
 *   - `currentFolderId`: the active folder ID from the stack.
 *   - `navigateTo(folderId)`: navigate to `folderId`, trimming forward history and pushing it onto the stack.
 *   - `navigateBack()`: move the current index one step backward when possible.
 *   - `navigateForward()`: move the current index one step forward when possible.
 */
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
