const IS_DEV = self.location.hostname === "localhost";

const logger = {
  info: (...args) => {
    if (IS_DEV) {
      console.info(...args);
    }
  },
  error: (...args) => {
    console.error(...args);
  },
};

let pyodideInstance = null;
let initPromise = null;

async function initializePyodide() {
  if (pyodideInstance) {
    return pyodideInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    importScripts("https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js");
    pyodideInstance = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/",
    });
    await pyodideInstance.loadPackage(["matplotlib", "numpy", "pandas", "scipy"]);
    return pyodideInstance;
  })();

  return initPromise;
}

async function render(code, requestId) {
  try {
    const pyodide = await initializePyodide();

    const pythonCode = `
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import io
import base64

${code}

buf = io.BytesIO()
plt.savefig(buf, format='png', dpi=110, bbox_inches='tight')
buf.seek(0)
b64 = base64.b64encode(buf.read()).decode('utf-8')
plt.close('all')
`;

    await pyodide.runPythonAsync(pythonCode);
    const b64 = pyodide.globals.get("b64");

    if (!b64 || typeof b64 !== "string") {
      throw new Error("No image generated from matplotlib code.");
    }

    self.postMessage({
      requestId,
      success: true,
      dataUrl: `data:image/png;base64,${b64}`,
    });
  } catch (error) {
    logger.error("[matplotlib-worker] render error", error);
    self.postMessage({
      requestId,
      success: false,
      error: error?.message || "Failed to render plot",
    });
  }
}

self.onmessage = async (event) => {
  const { type, requestId, code } = event.data || {};

  if (type === "INITIALIZE") {
    try {
      await initializePyodide();
      self.postMessage({ type: "INITIALIZED", success: true });
    } catch (error) {
      self.postMessage({ type: "INITIALIZED", success: false, error: error?.message || "Failed to initialize" });
    }
    return;
  }

  if (type === "RENDER_PLOT") {
    logger.info("[matplotlib-worker] rendering", requestId);
    await render(code || "", requestId);
  }
};
