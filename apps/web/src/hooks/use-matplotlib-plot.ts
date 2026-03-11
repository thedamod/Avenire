"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface State {
  error: string | null;
  imgUrl: string | null;
  loading: boolean;
}

const CACHE_KEY_PREFIX = "matplotlib-plot:";
const HASH_MODULUS = 2_147_483_647;

function hashPlotCode(code: string) {
  let hash = 0;
  for (let index = 0; index < code.length; index += 1) {
    hash = (hash * 31 + code.charCodeAt(index)) % HASH_MODULUS;
  }
  return hash.toString(36);
}

function readCachedPlot(cacheKey: string | null) {
  if (!cacheKey) {
    return null;
  }

  try {
    return window.localStorage.getItem(cacheKey);
  } catch {
    return null;
  }
}

function writeCachedPlot(cacheKey: string | null, dataUrl: string) {
  if (!cacheKey) {
    return;
  }

  try {
    window.localStorage.setItem(cacheKey, dataUrl);
  } catch {
    // Ignore storage failures and keep the rendered image in memory.
  }
}

function isMessageForRequest(
  data: Record<string, unknown>,
  requestId: string
): boolean {
  return !(
    "requestId" in data &&
    typeof data.requestId === "string" &&
    data.requestId !== requestId
  );
}

function isInitializedMessage(data: Record<string, unknown>) {
  return "type" in data && data.type === "INITIALIZED";
}

function getSuccessfulDataUrl(data: Record<string, unknown>) {
  if (
    data.success === true &&
    "dataUrl" in data &&
    typeof data.dataUrl === "string"
  ) {
    return data.dataUrl;
  }

  return null;
}

export function useMatplotlibPlot(code: string) {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<State>({
    loading: false,
    error: null,
    imgUrl: null,
  });

  const requestId = useMemo(
    () => `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    [code]
  );
  const cacheKey = useMemo(
    () => (code.trim() ? `${CACHE_KEY_PREFIX}${hashPlotCode(code)}` : null),
    [code]
  );

  useEffect(() => {
    if (!code?.trim()) {
      setState({ loading: false, error: null, imgUrl: null });
      return;
    }

    const cachedPlot = readCachedPlot(cacheKey);
    if (cachedPlot) {
      setState({ loading: false, error: null, imgUrl: cachedPlot });
      return;
    }

    if (!workerRef.current) {
      workerRef.current = new Worker("/workers/matplotlib-worker.js");
      workerRef.current.postMessage({ type: "INITIALIZE" });
    }

    const worker = workerRef.current;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    const onMessage = (event: MessageEvent) => {
      const data = event.data as Record<string, unknown>;

      if (!isMessageForRequest(data, requestId)) {
        return;
      }

      if (isInitializedMessage(data)) {
        return;
      }

      const dataUrl = getSuccessfulDataUrl(data);
      if (dataUrl) {
        writeCachedPlot(cacheKey, dataUrl);
        setState({ loading: false, error: null, imgUrl: dataUrl });
        return;
      }

      setState({
        loading: false,
        error:
          typeof data.error === "string" ? data.error : "Failed to render plot",
        imgUrl: null,
      });
    };

    worker.addEventListener("message", onMessage);
    worker.postMessage({ type: "RENDER_PLOT", requestId, code });

    return () => {
      worker.removeEventListener("message", onMessage);
    };
  }, [cacheKey, code, requestId]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  return state;
}
