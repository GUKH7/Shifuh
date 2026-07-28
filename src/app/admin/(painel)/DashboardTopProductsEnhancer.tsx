"use client";

import { useEffect } from "react";

const DESKTOP_PRODUCT_LABEL_LENGTH = 20;
const MOBILE_PRODUCT_LABEL_LENGTH = 16;
const MOBILE_BREAKPOINT = 639;
const MOBILE_STYLE_ID = "dashboard-top-products-mobile-labels";
const LABEL_OVERLAY_SELECTOR = "[data-top-products-label-overlay='true']";

const MOBILE_STYLE_TEXT = `
@media (max-width: ${MOBILE_BREAKPOINT}px) {
  article[data-top-products-card="true"] .recharts-tooltip-wrapper {
    max-width: calc(100vw - 2rem);
  }

  article[data-top-products-card="true"] .recharts-default-tooltip {
    min-width: 180px;
    max-width: min(260px, calc(100vw - 2rem));
  }
}
`;

function normalizeProductLabel(label: string) {
  return label.replace(/\s+/g, " ").trim();
}

function getProductLabelLimit() {
  return window.innerWidth <= MOBILE_BREAKPOINT
    ? MOBILE_PRODUCT_LABEL_LENGTH
    : DESKTOP_PRODUCT_LABEL_LENGTH;
}

function abbreviateProductLabel(label: string, maxLength = getProductLabelLimit()) {
  const normalized = normalizeProductLabel(label);
  if (normalized.length <= maxLength) return normalized;

  const availableLength = Math.max(4, maxLength - 1);
  const candidate = normalized.slice(0, availableLength);
  const lastSpace = candidate.lastIndexOf(" ");
  const safeCut = lastSpace >= Math.floor(availableLength * 0.65)
    ? lastSpace
    : availableLength;

  return `${normalized.slice(0, safeCut).trimEnd()}…`;
}

function readFullProductLabel(node: SVGTextElement) {
  const savedLabel = node.dataset.fullProductLabel;
  if (savedLabel) return savedLabel;

  const tspanLabel = Array.from(node.querySelectorAll("tspan"))
    .map((item) => item.textContent?.trim() || "")
    .filter(Boolean)
    .join(" ");
  const fullLabel = normalizeProductLabel(tspanLabel || node.textContent || "");

  if (fullLabel) node.dataset.fullProductLabel = fullLabel;
  return fullLabel;
}

function findTopProductsCard(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLElement>("article")).find((article) =>
    article.textContent?.includes("Produtos mais pedidos"),
  );
}

function getChartHost(card: HTMLElement) {
  const responsiveContainer = card.querySelector<HTMLElement>(".recharts-responsive-container");
  return responsiveContainer?.parentElement instanceof HTMLElement
    ? responsiveContainer.parentElement
    : null;
}

function getProductTickNodes(card: HTMLElement) {
  const selectors = [
    ".recharts-yAxis .recharts-cartesian-axis-tick-value",
    ".recharts-yAxis .recharts-cartesian-axis-tick text",
    ".recharts-yAxis text",
  ].join(",");

  return Array.from(new Set(card.querySelectorAll<SVGTextElement>(selectors)))
    .filter((node) => normalizeProductLabel(node.textContent || "").length > 0);
}

function ensureMobileStyles() {
  const existingStyle = document.getElementById(MOBILE_STYLE_ID) as HTMLStyleElement | null;
  if (existingStyle) return existingStyle;

  const style = document.createElement("style");
  style.id = MOBILE_STYLE_ID;
  style.textContent = MOBILE_STYLE_TEXT;
  document.head.appendChild(style);
  return style;
}

function createLabelOverlay(card: HTMLElement) {
  const host = getChartHost(card);
  const tickNodes = getProductTickNodes(card);
  if (!host || tickNodes.length === 0) return;

  const hostRect = host.getBoundingClientRect();
  if (hostRect.width === 0 || hostRect.height === 0) return;

  if (window.getComputedStyle(host).position === "static") {
    host.style.position = "relative";
  }

  let overlay = host.querySelector<HTMLElement>(LABEL_OVERLAY_SELECTOR);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.dataset.topProductsLabelOverlay = "true";
    host.appendChild(overlay);
  }

  overlay.replaceChildren();
  Object.assign(overlay.style, {
    position: "absolute",
    inset: "0",
    overflow: "visible",
    pointerEvents: "none",
    zIndex: "4",
  });

  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
  const axisWidth = isMobile ? 112 : 120;

  tickNodes.forEach((tickNode) => {
    const fullLabel = readFullProductLabel(tickNode);
    if (!fullLabel) return;

    const tickRect = tickNode.getBoundingClientRect();
    const centerY = tickRect.top - hostRect.top + tickRect.height / 2;
    const shortLabel = abbreviateProductLabel(fullLabel);

    tickNode.dataset.topProductsNativeLabel = "true";
    tickNode.setAttribute("aria-label", fullLabel);
    tickNode.style.opacity = "0";

    const label = document.createElement("span");
    label.textContent = shortLabel;
    label.title = fullLabel;
    label.setAttribute("aria-hidden", "true");
    Object.assign(label.style, {
      position: "absolute",
      left: "0",
      top: `${centerY}px`,
      width: `${axisWidth}px`,
      paddingRight: "8px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      textAlign: "right",
      color: "#3f3833",
      fontSize: isMobile ? "10px" : "11px",
      fontWeight: "700",
      lineHeight: "1.15",
      letterSpacing: isMobile ? "-0.015em" : "normal",
      transform: "translateY(-50%)",
    });
    overlay.appendChild(label);
  });

  card.dataset.topProductsCard = "true";
  card.dataset.mobileLabels = isMobile ? "true" : "false";
}

function restoreNativeLabels(root: ParentNode) {
  root.querySelectorAll<SVGTextElement>("[data-top-products-native-label='true']")
    .forEach((node) => {
      node.style.opacity = "";
      delete node.dataset.topProductsNativeLabel;
    });

  root.querySelectorAll<HTMLElement>(LABEL_OVERLAY_SELECTOR).forEach((overlay) => overlay.remove());
}

function isOverlayMutation(mutation: MutationRecord) {
  const target = mutation.target instanceof Element
    ? mutation.target
    : mutation.target.parentElement;
  return Boolean(target?.closest(LABEL_OVERLAY_SELECTOR));
}

export default function DashboardTopProductsEnhancer() {
  useEffect(() => {
    const mobileStyle = ensureMobileStyles();
    let animationFrame = 0;
    let delayedEnhancements: number[] = [];

    const enhance = () => {
      const shell = document.querySelector(".admin-page-shell");
      if (!shell) return;

      const card = findTopProductsCard(shell);
      if (!card) return;
      createLabelOverlay(card);
    };

    const scheduleEnhancement = () => {
      window.cancelAnimationFrame(animationFrame);
      delayedEnhancements.forEach((timeout) => window.clearTimeout(timeout));

      animationFrame = window.requestAnimationFrame(enhance);
      delayedEnhancements = [
        window.setTimeout(enhance, 120),
        window.setTimeout(enhance, 360),
      ];
    };

    scheduleEnhancement();

    const observedRoot = document.querySelector(".admin-page-shell") || document.body;
    const mutationObserver = new MutationObserver((mutations) => {
      if (mutations.every(isOverlayMutation)) return;
      scheduleEnhancement();
    });
    mutationObserver.observe(observedRoot, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(scheduleEnhancement);
    resizeObserver?.observe(observedRoot);

    window.addEventListener("resize", scheduleEnhancement);
    window.addEventListener("orientationchange", scheduleEnhancement);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      delayedEnhancements.forEach((timeout) => window.clearTimeout(timeout));
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleEnhancement);
      window.removeEventListener("orientationchange", scheduleEnhancement);
      restoreNativeLabels(observedRoot);
      mobileStyle.remove();
    };
  }, []);

  return null;
}
