"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type State = {
  loading: boolean;
  error: string | null;
  imgUrl: string | null;
};

export function useMatplotlibPlot(code: string) {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<State>({
    loading: false,
    error: null,
    imgUrl: null,
  });

  const requestId = useMemo(() => `${Date.now()}-${Math.random().toString(36).slice(2)}`, [code]);

  useEffect(() => {
    if (!code?.trim()) {
      setState({ loading: false, error: null, imgUrl: null });
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

      if (
        "requestId" in data &&
        typeof data.requestId === "string" &&
        data.requestId !== requestId
      ) {
        return;
      }

      if ("type" in data && data.type === "INITIALIZED") {
        return;
      }

      if (
        data.success === true &&
        "dataUrl" in data &&
        typeof data.dataUrl === "string"
      ) {
        setState({ loading: false, error: null, imgUrl: data.dataUrl });
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
  }, [code, requestId]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  return state;
}
