"use client";

import { useEffect } from "react";

const DESKTOP_PRODUCT_LABEL_LENGTH = 20;
const MOBILE_PRODUCT_LABEL_LENGTH = 16;
const MOBILE_BREAKPOINT = 639;
const LABEL_OVERLAY_SELECTOR = ".top-products-label-overlay";

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

function createLabelOverlay(card: HTMLElement) {
  const host = getChartHost(card);
  const tickNodes = getProductTickNodes(card);
  if (!host || tickNodes.length === 0) return;

  host.classList.add("top-products-chart-host");
  card.dataset.topProductsCard = "true";

  let overlay = host.querySelector<HTMLElement>(LABEL_OVERLAY_SELECTOR);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "top-products-label-overlay";
    overlay.setAttribute("aria-hidden", "true");
    host.appendChild(overlay);
  }

  const labels = tickNodes.map((tickNode) => {
    const fullLabel = readFullProductLabel(tickNode);
    tickNode.setAttribute("aria-label", fullLabel);

    const label = document.createElement("span");
    label.className = "top-products-label";
    label.textContent = abbreviateProductLabel(fullLabel);
    label.title = fullLabel;
    return label;
  });

  overlay.dataset.count = String(Math.min(labels.length, 5));
  overlay.replaceChildren(...labels);
}

function removeLabelOverlay(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(LABEL_OVERLAY_SELECTOR).forEach((overlay) => {
    overlay.parentElement?.classList.remove("top-products-chart-host");
    overlay.remove();
  });

  root.querySelectorAll<HTMLElement>("[data-top-products-card='true']").forEach((card) => {
    delete card.dataset.topProductsCard;
  });
}

function isOverlayMutation(mutation: MutationRecord) {
  const target = mutation.target instanceof Element
    ? mutation.target
    : mutation.target.parentElement;
  return Boolean(target?.closest(LABEL_OVERLAY_SELECTOR));
}

export default function DashboardTopProductsEnhancer() {
  useEffect(() => {
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
      removeLabelOverlay(observedRoot);
    };
  }, []);

  return null;
}
