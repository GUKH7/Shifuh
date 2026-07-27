"use client";

import { useEffect } from "react";

const DESKTOP_PRODUCT_LABEL_LENGTH = 20;
const MOBILE_PRODUCT_LABEL_LENGTH = 16;
const MOBILE_BREAKPOINT = 639;
const MOBILE_STYLE_ID = "dashboard-top-products-mobile-labels";

const MOBILE_STYLE_TEXT = `
@media (max-width: ${MOBILE_BREAKPOINT}px) {
  article[data-top-products-card="true"] .recharts-yAxis .recharts-cartesian-axis-tick-value {
    font-size: 10px !important;
    font-weight: 700;
    letter-spacing: -0.015em;
    white-space: pre;
  }

  article[data-top-products-card="true"] .recharts-yAxis .recharts-cartesian-axis-tick-value tspan:not(:first-child) {
    display: none;
  }

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

function ensureMobileStyles() {
  const existingStyle = document.getElementById(MOBILE_STYLE_ID) as HTMLStyleElement | null;
  if (existingStyle) return existingStyle;

  const style = document.createElement("style");
  style.id = MOBILE_STYLE_ID;
  style.textContent = MOBILE_STYLE_TEXT;
  document.head.appendChild(style);
  return style;
}

function enhanceTopProductsChart() {
  const shell = document.querySelector(".admin-page-shell");
  if (!shell) return;

  const card = findTopProductsCard(shell);
  if (!card) return;

  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
  card.dataset.topProductsCard = "true";
  card.dataset.mobileLabels = isMobile ? "true" : "false";

  card
    .querySelectorAll<SVGTextElement>(".recharts-yAxis .recharts-cartesian-axis-tick-value")
    .forEach((labelNode) => {
      const fullLabel = readFullProductLabel(labelNode);
      if (!fullLabel) return;

      const shortLabel = abbreviateProductLabel(fullLabel);
      if (labelNode.textContent !== shortLabel || labelNode.querySelector("tspan")) {
        labelNode.replaceChildren(document.createTextNode(shortLabel));
      }

      labelNode.setAttribute("aria-label", fullLabel);
      labelNode.setAttribute("xml:space", "preserve");
      labelNode.style.whiteSpace = "pre";
    });
}

export default function DashboardTopProductsEnhancer() {
  useEffect(() => {
    const mobileStyle = ensureMobileStyles();
    let animationFrame = 0;
    let delayedEnhancements: number[] = [];

    const scheduleEnhancement = () => {
      window.cancelAnimationFrame(animationFrame);
      delayedEnhancements.forEach((timeout) => window.clearTimeout(timeout));

      animationFrame = window.requestAnimationFrame(enhanceTopProductsChart);
      delayedEnhancements = [
        window.setTimeout(enhanceTopProductsChart, 100),
        window.setTimeout(enhanceTopProductsChart, 320),
      ];
    };

    scheduleEnhancement();

    const observedRoot = document.querySelector(".admin-page-shell") || document.body;
    const mutationObserver = new MutationObserver(scheduleEnhancement);
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
      mobileStyle.remove();
    };
  }, []);

  return null;
}
