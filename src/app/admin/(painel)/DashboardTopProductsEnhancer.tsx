"use client";

import { useEffect } from "react";

const MAX_PRODUCT_LABEL_LENGTH = 20;

function normalizeProductLabel(label: string) {
  return label.replace(/\s+/g, " ").trim();
}

function abbreviateProductLabel(label: string) {
  const normalized = normalizeProductLabel(label);
  if (normalized.length <= MAX_PRODUCT_LABEL_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_PRODUCT_LABEL_LENGTH - 1).trimEnd()}…`;
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

  card.dataset.topProductsCard = "true";

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
    });
}

export default function DashboardTopProductsEnhancer() {
  useEffect(() => {
    let animationFrame = 0;
    const scheduleEnhancement = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(enhanceTopProductsChart);
    };

    scheduleEnhancement();

    const observedRoot = document.querySelector(".admin-page-shell") || document.body;
    const observer = new MutationObserver(scheduleEnhancement);
    observer.observe(observedRoot, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    window.addEventListener("resize", scheduleEnhancement);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      window.removeEventListener("resize", scheduleEnhancement);
    };
  }, []);

  return null;
}
