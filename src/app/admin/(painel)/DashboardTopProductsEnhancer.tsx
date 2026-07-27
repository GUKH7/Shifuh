"use client";

import { useEffect } from "react";

const DESKTOP_PRODUCT_LABEL_LENGTH = 20;
const MOBILE_PRODUCT_LABEL_LENGTH = 16;
const MOBILE_BREAKPOINT = 639;

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
    Array.from(article.querySelectorAll("p")).some(
      (paragraph) => paragraph.textContent?.trim() === "Produtos mais pedidos",
    ),
  );
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
    let animationFrame = 0;
    let delayedEnhancement = 0;

    const scheduleEnhancement = () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(delayedEnhancement);

      animationFrame = window.requestAnimationFrame(enhanceTopProductsChart);
      delayedEnhancement = window.setTimeout(enhanceTopProductsChart, 120);
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
      window.clearTimeout(delayedEnhancement);
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleEnhancement);
      window.removeEventListener("orientationchange", scheduleEnhancement);
    };
  }, []);

  return null;
}
