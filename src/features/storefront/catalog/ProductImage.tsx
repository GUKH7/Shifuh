"use client";

import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";

type ProductImageProps = {
  src: string | null | undefined;
  alt: string;
  sizes: string;
  className?: string;
  fallbackClassName?: string;
};

export function ProductImage({
  src,
  alt,
  sizes,
  className = "object-cover",
  fallbackClassName = "",
}: ProductImageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return (
      <div
        data-product-image-unavailable
        role="img"
        aria-label={`Imagem indisponível para ${alt}`}
        className={`flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-gray-50 to-gray-100 text-gray-400 ${fallbackClassName}`}
      >
        <ImageIcon size={24} strokeWidth={1.7} aria-hidden="true" />
        <span className="text-[9px] font-bold uppercase">Sem foto</span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
