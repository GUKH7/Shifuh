"use client";

import { useEffect, useState } from "react";
import type { PublicCategory } from "./public-storefront-types";

export function useStorefrontNavigation({
  categories,
  bannerCount,
}: {
  categories: PublicCategory[];
  bannerCount: number;
}) {
  const [currentBanner, setCurrentBanner] = useState(0);
  const [activeCategory, setActiveCategory] = useState("");

  useEffect(() => {
    if (categories.length === 0) {
      setActiveCategory("");
      return;
    }

    setActiveCategory((current) =>
      categories.some((category) => category.id === current) ? current : categories[0].id,
    );
  }, [categories]);

  useEffect(() => {
    setCurrentBanner((current) => (current < bannerCount ? current : 0));
    if (bannerCount <= 1) return;

    const timer = window.setInterval(() => {
      setCurrentBanner((current) => (current + 1) % bannerCount);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [bannerCount]);

  useEffect(() => {
    const handleScroll = () => {
      const offsets = categories.flatMap((category) => {
        const element = document.getElementById(`cat-${category.id}`);
        return element ? [{ id: category.id, offset: element.offsetTop }] : [];
      });
      const current = offsets.findLast((item) => window.scrollY + 240 >= item.offset);
      if (current) setActiveCategory(current.id);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [categories]);

  return { currentBanner, activeCategory, setActiveCategory };
}
