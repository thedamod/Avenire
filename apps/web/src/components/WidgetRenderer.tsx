"use client";

import { useEffect, useRef, useCallback } from "react";
import { useTheme } from "next-themes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WidgetRendererProps {
  /** Raw HTML/CSS/JS fragment from the AI */
  html: string;
  /** Called when the widget calls sendMessage(text) */
  onSendMessage?: (text: string) => void;
  /** Called when the widget calls openLink(url) */
  onOpenLink?: (url: string) => void;
  /** Run inline scripts after content updates (disable during streaming). */
  runScripts?: boolean;
  /** Whether the widget is still streaming (used for shimmer). */
  isStreaming?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// CSS variable extraction
// ---------------------------------------------------------------------------

/**
 * Reads all CSS custom properties from the host document's :root
 * and returns them as a flat object: { "--background": "...", ... }
 */
function extractThemeVars(): Record<string, string> {
  const style = getComputedStyle(document.documentElement);
  const vars: Record<string, string> = {};
  for (let i = 0; i < style.length; i += 1) {
    const name = style[i];
    if (!name?.startsWith("--")) continue;
    const val = style.getPropertyValue(name).trim();
    if (val) vars[name] = val;
  }
  return vars;
}

/**
 * Serializes CSS vars into a :root { ... } block to inject into the iframe.
 */
function buildCssVarBlock(vars: Record<string, string>): string {
  const declarations = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  return `:root {\n${declarations}\n}`;
}

// ---------------------------------------------------------------------------
// SVG pre-built classes
// These mirror the classes documented in REFERENCE.md so SVG widgets work
// without needing Chart.js or any library.
// ---------------------------------------------------------------------------

const SVG_CLASSES = `
svg .t  { font-family: var(--font-sans, sans-serif); font-size: 14px; font-weight: 400; fill: var(--foreground); }
svg .ts { font-family: var(--font-sans, sans-serif); font-size: 12px; font-weight: 400; fill: var(--muted-foreground); }
svg .th { font-family: var(--font-sans, sans-serif); font-size: 14px; font-weight: 500; fill: var(--foreground); }
svg .arr { fill: none; stroke: var(--muted-foreground); stroke-width: 1.5px; }
svg .leader { fill: none; stroke: var(--muted-foreground); stroke-width: 0.5px; stroke-dasharray: 4 3; }
svg .node { cursor: pointer; }
svg .node:hover { opacity: 0.75; }

/* ── SVG color ramps (using Notion semantic CSS variables) ── */
svg .c-purple > rect,
svg .c-purple > circle,
svg .c-purple > ellipse,
svg rect.c-purple,
svg circle.c-purple,
svg ellipse.c-purple { fill: var(--color-bg-purple); stroke: var(--color-pill-purple); }
svg .c-purple > .t,
svg .c-purple > .th { fill: var(--color-text-purple); }
svg .c-purple > .ts { fill: var(--color-text-purple); opacity: 0.8; }

svg .c-teal > rect,
svg .c-teal > circle,
svg .c-teal > ellipse,
svg rect.c-teal,
svg circle.c-teal,
svg ellipse.c-teal { fill: var(--color-bg-green); stroke: var(--color-pill-green); }
svg .c-teal > .t,
svg .c-teal > .th { fill: var(--color-text-green); }
svg .c-teal > .ts { fill: var(--color-text-green); opacity: 0.8; }

svg .c-coral > rect,
svg .c-coral > circle,
svg .c-coral > ellipse,
svg rect.c-coral,
svg circle.c-coral,
svg ellipse.c-coral { fill: var(--color-bg-orange); stroke: var(--color-pill-orange); }
svg .c-coral > .t,
svg .c-coral > .th { fill: var(--color-text-orange); }
svg .c-coral > .ts { fill: var(--color-text-orange); opacity: 0.8; }

svg .c-pink > rect,
svg .c-pink > circle,
svg .c-pink > ellipse,
svg rect.c-pink,
svg circle.c-pink,
svg ellipse.c-pink { fill: var(--color-bg-pink); stroke: var(--color-pill-pink); }
svg .c-pink > .t,
svg .c-pink > .th { fill: var(--color-text-pink); }
svg .c-pink > .ts { fill: var(--color-text-pink); opacity: 0.8; }

svg .c-gray > rect,
svg .c-gray > circle,
svg .c-gray > ellipse,
svg rect.c-gray,
svg circle.c-gray,
svg ellipse.c-gray { fill: var(--color-bg-gray); stroke: var(--color-pill-gray); }
svg .c-gray > .t,
svg .c-gray > .th { fill: var(--color-text-gray); }
svg .c-gray > .ts { fill: var(--color-text-gray); opacity: 0.8; }

svg .c-blue > rect,
svg .c-blue > circle,
svg .c-blue > ellipse,
svg rect.c-blue,
svg circle.c-blue,
svg ellipse.c-blue { fill: var(--color-bg-blue); stroke: var(--color-pill-blue); }
svg .c-blue > .t,
svg .c-blue > .th { fill: var(--color-text-blue); }
svg .c-blue > .ts { fill: var(--color-text-blue); opacity: 0.8; }

svg .c-green > rect,
svg .c-green > circle,
svg .c-green > ellipse,
svg rect.c-green,
svg circle.c-green,
svg ellipse.c-green { fill: var(--color-bg-green); stroke: var(--color-pill-green); }
svg .c-green > .t,
svg .c-green > .th { fill: var(--color-text-green); }
svg .c-green > .ts { fill: var(--color-text-green); opacity: 0.8; }

svg .c-amber > rect,
svg .c-amber > circle,
svg .c-amber > ellipse,
svg rect.c-amber,
svg circle.c-amber,
svg ellipse.c-amber { fill: var(--color-bg-yellow); stroke: var(--color-pill-yellow); }
svg .c-amber > .t,
svg .c-amber > .th { fill: var(--color-text-yellow); }
svg .c-amber > .ts { fill: var(--color-text-yellow); opacity: 0.8; }

svg .c-red > rect,
svg .c-red > circle,
svg .c-red > ellipse,
svg rect.c-red,
svg circle.c-red,
svg ellipse.c-red { fill: var(--color-bg-red); stroke: var(--color-pill-red); }
svg .c-red > .t,
svg .c-red > .th { fill: var(--color-text-red); }
svg .c-red > .ts { fill: var(--color-text-red); opacity: 0.8; }

svg .c-black > rect,
svg .c-black > circle,
svg .c-black > ellipse,
svg rect.c-black,
svg circle.c-black,
svg ellipse.c-black { fill: var(--foreground); stroke: var(--border); }
svg .c-black > .t,
svg .c-black > .th { fill: var(--background); }
svg .c-black > .ts { fill: var(--background); opacity: 0.8; }
`;

// ---------------------------------------------------------------------------
// Base HTML shell injected into the iframe
// ---------------------------------------------------------------------------

function buildIframeDocument(cssVarBlock: string, isDark: boolean): string {
  return `<!DOCTYPE html>
<html lang="en" class="${isDark ? "dark" : ""}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
/* ── Base reset ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  background: var(--card);
  color: var(--foreground);
  font-family: var(--font-sans, system-ui, sans-serif);
  font-size: 14px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  padding: 12px;
}

/* ── Form element defaults matching shadcn aesthetic ── */
input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
  outline: none;
  cursor: pointer;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px; height: 16px;
  border-radius: 50%;
  background: var(--primary);
  border: 2px solid var(--background);
  box-shadow: 0 0 0 1px var(--primary);
  cursor: pointer;
  transition: transform .1s;
}
input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.15); }

input[type="range"]::-moz-range-thumb {
  width: 16px; height: 16px;
  border-radius: 50%;
  background: var(--primary);
  border: 2px solid var(--background);
  cursor: pointer;
}

input[type="checkbox"] {
  accent-color: var(--primary);
  cursor: pointer;
  width: 14px; height: 14px;
}

input[type="text"],
input[type="number"],
textarea {
  background: var(--input);
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 6px 10px;
  font-size: 13px;
  font-family: var(--font-sans, sans-serif);
  outline: none;
  transition: border-color .15s, box-shadow .15s;
}
input[type="text"]:focus,
input[type="number"]:focus,
textarea:focus {
  border-color: var(--ring);
  box-shadow: 0 0 0 2px color-mix(in oklch, var(--ring), transparent 70%);
}

select {
  background: var(--background);
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) - 2px);
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
  outline: none;
  transition: border-color .15s;
}
select:hover  { border-color: var(--ring); }
select:focus  { border-color: var(--ring); }

button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-radius: var(--radius);
  padding: 6px 14px;
  font-size: 13px;
  font-family: var(--font-sans, sans-serif);
  background: var(--primary);
  color: var(--primary-foreground);
  border: 1px solid color-mix(in oklch, var(--primary), var(--border) 40%);
  cursor: pointer;
  transition: opacity .15s, background .15s, transform .1s;
}
button:active { transform: scale(.97); }
button:disabled { opacity: .6; cursor: not-allowed; }

/* ── SVG pre-built classes ── */
${SVG_CLASSES}

/* ── Scrollbar ── */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

@keyframes _fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
<style id="avenire-css-vars">
${cssVarBlock}
</style>
</head>
<body>
<div id="root"></div>

<script>
/* ── Avenire globals ── */
window.sendMessage = function(text) {
  window.parent.postMessage({ type: 'avenire:sendMessage', text }, '*');
};
window.sendPrompt = function(text) {
  window.sendMessage(text);
};
window.openLink = function(url) {
  window.parent.postMessage({ type: 'avenire:openLink', url }, '*');
};

/* ── Morphdom render pipeline ── */
window._morphReady = false;
window._pending = null;
window._setContent = function(html, runScripts) {
  if (!window._morphReady) {
    window._pending = { html: html, runScripts: !!runScripts };
    return;
  }
  var root = document.getElementById('root');
  var target = document.createElement('div');
  target.id = 'root';
  target.innerHTML = html;
  morphdom(root, target, {
    onBeforeElUpdated: function(from, to) {
      if (from.isEqualNode(to)) return false;
      return true;
    },
    onNodeAdded: function(node) {
      if (node && node.nodeType === 1) {
        node.style.animation = '_fadeIn 0.22s ease both';
      }
      return node;
    },
  });
  if (runScripts) {
    window._runScripts();
  }
};
window._runScripts = function() {
  var scripts = Array.prototype.slice.call(document.querySelectorAll('#root script'));
  return (async function() {
    for (var i = 0; i < scripts.length; i += 1) {
      var old = scripts[i];
      var s = document.createElement('script');
      Array.from(old.attributes || []).forEach(function(attr) {
        s.setAttribute(attr.name, attr.value);
      });
      if (!old.hasAttribute('async') && !old.hasAttribute('defer') && old.type !== 'module') {
        s.async = false;
      }
      var parent = old.parentNode;
      if (!parent) continue;
      parent.replaceChild(s, old);

      if (s.src) {
        await new Promise(function(resolve) {
          s.addEventListener('load', resolve, { once: true });
          s.addEventListener('error', resolve, { once: true });
        });
      } else {
        s.textContent = old.textContent;
      }
    }
  })();
};
window._applyCssVars = function(cssText) {
  var style = document.getElementById('avenire-css-vars');
  if (style) style.textContent = cssText;
};

window.addEventListener('message', function(event) {
  var data = event.data || {};
  if (data.type === 'avenire:setContent' && typeof data.html === 'string') {
    window._setContent(data.html, !!data.runScripts);
    return;
  }
  if (data.type === 'avenire:setCssVars' && typeof data.cssText === 'string') {
    window._applyCssVars(data.cssText);
    return;
  }
});

/* ── Auto-resize: tell parent our scroll height ── */
function reportHeight() {
  const h = document.documentElement.scrollHeight;
  window.parent.postMessage({ type: 'avenire:resize', height: h }, '*');
}

const ro = new ResizeObserver(reportHeight);
ro.observe(document.body);
reportHeight();

/* ── Intercept <a> clicks ── */
document.addEventListener('click', function(e) {
  const a = e.target.closest('a[href]');
  if (a && a.href && !a.href.startsWith('javascript')) {
    e.preventDefault();
    window.openLink(a.href);
  }
});
</script>
<script src="https://cdn.jsdelivr.net/npm/morphdom@2.7.4/dist/morphdom-umd.min.js"
  onload="window._morphReady=true;if(window._pending){window._setContent(window._pending.html, window._pending.runScripts);window._pending=null;}"></script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WidgetRenderer({
  html,
  onSendMessage,
  onOpenLink,
  runScripts = true,
  isStreaming = false,
  className = "",
}: WidgetRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoHeightRef = useRef<number>(320);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const isReadyRef = useRef(false);

  const postToIframe = useCallback((data: Record<string, unknown>) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(data, "*");
  }, []);

  const writeCssVars = useCallback(() => {
    const vars = extractThemeVars();
    const cssVarBlock = buildCssVarBlock(vars);
    postToIframe({ type: "avenire:setCssVars", cssText: cssVarBlock });
  }, [postToIframe]);

  const writeContent = useCallback(
    (nextHtml: string, shouldRunScripts: boolean) => {
      postToIframe({
        type: "avenire:setContent",
        html: nextHtml,
        runScripts: shouldRunScripts,
      });
    },
    [postToIframe]
  );

  // Build the iframe document once; updates happen via postMessage + morphdom
  const initIframe = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const vars = extractThemeVars();
    const cssVarBlock = buildCssVarBlock(vars);
    const doc = buildIframeDocument(cssVarBlock, isDark);

    // srcdoc is cleaner than document.write — no navigation events
    iframe.srcdoc = doc;
  }, [isDark]);

  useEffect(() => {
    initIframe();
  }, [initIframe]);

  useEffect(() => {
    if (!isReadyRef.current) return;
    writeCssVars();
  }, [writeCssVars, isDark]);

  useEffect(() => {
    if (!isReadyRef.current) return;
    writeContent(html, runScripts);
  }, [html, runScripts, writeContent]);

  // Listen for messages from the iframe
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (!iframeRef.current) return;
      // Only accept messages from our iframe
      if (e.source !== iframeRef.current.contentWindow) return;

      const { type, text, url, height: h } = e.data ?? {};

      if (type === "avenire:sendMessage" && text && onSendMessage) {
        onSendMessage(text);
      }
      if (type === "avenire:openLink" && url && onOpenLink) {
        onOpenLink(url);
      }
      if (type === "avenire:resize" && typeof h === "number") {
        // Auto-height mode: resize iframe to content
        autoHeightRef.current = Math.max(80, h + 2); // +2 for border
        if (iframeRef.current) {
          iframeRef.current.style.height = autoHeightRef.current + "px";
        }
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onSendMessage, onOpenLink]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-visible rounded-lg border border-border bg-card ${className}`}
    >
      {isStreaming && (
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-lg bg-background/5 backdrop-blur-[0.5px]">
          <div
            className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-foreground/5 to-transparent"
            style={{ animation: "shimmer 2.5s infinite linear" }}
          />
          <style>{`
            @keyframes shimmer {
              100% { transform: translateX(100%); }
            }
          `}</style>
        </div>
      )}
      <iframe
        ref={iframeRef}
        title="Avenire Widget"
        sandbox="allow-scripts"
        onLoad={() => {
          isReadyRef.current = true;
          writeCssVars();
          writeContent(html, runScripts);
        }}
        style={{
          width: "100%",
          height: `${autoHeightRef.current}px`,
          border: "none",
          display: "block",
          background: "var(--card)",
        }}
      />
    </div>
  );
}
