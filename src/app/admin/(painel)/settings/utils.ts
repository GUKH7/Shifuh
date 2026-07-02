import { DAYS_OF_WEEK } from "./constants";
import type { WorkHour } from "./types";

export function normalizeWorkHours(rawValue: unknown): WorkHour[] {
  const incoming = Array.isArray(rawValue) ? rawValue : [];

  return DAYS_OF_WEEK.map((day) => {
    const match = incoming.find((item) => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<WorkHour>;
      return Number(candidate.day_id) === day.id;
    }) as Partial<WorkHour> | undefined;

    return {
      day_id: day.id,
      day_label: match?.day_label || day.label,
      is_open: typeof match?.is_open === "boolean" ? match.is_open : true,
      open_time: match?.open_time || "18:00",
      close_time: match?.close_time || "23:00",
    };
  });
}

export function hexToRgba(hex: string, opacity: number) {
  const normalized = hex.replace("#", "");
  const full = normalized.length === 3 ? normalized.split("").map((char) => `${char}${char}`).join("") : normalized;

  if (full.length !== 6) return `rgba(17, 24, 39, ${opacity})`;

  const red = Number.parseInt(full.slice(0, 2), 16);
  const green = Number.parseInt(full.slice(2, 4), 16);
  const blue = Number.parseInt(full.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });

export async function getCroppedImg(imageSrc: string, pixelCrop: { x: number; y: number; width: number; height: number }): Promise<File | null> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
  return new Promise((resolve) =>
    canvas.toBlob((blob) => {
      if (!blob) return resolve(null);
      resolve(new File([blob], "cropped-image.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.92),
  );
}

export async function readJsonResponse(response: Response) {
  const payloadText = await response.text();

  if (!payloadText) {
    return {};
  }

  try {
    return JSON.parse(payloadText) as Record<string, any>;
  } catch {
    return {
      error: payloadText,
    };
  }
}

export function listFromIfoodPayload(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.merchants)) return payload.merchants;
  if (Array.isArray(payload?.interruptions)) return payload.interruptions;
  if (Array.isArray(payload?.shifts)) return payload.shifts;
  return [];
}

export function firstFromIfoodPayload(payload: any): any {
  return listFromIfoodPayload(payload)[0] || (payload && !Array.isArray(payload) ? payload : null);
}

export function compactJson(payload: any) {
  if (!payload) return "Sem dados.";
  return JSON.stringify(payload, null, 2);
}
