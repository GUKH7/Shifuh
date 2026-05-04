"use client";

import { useState } from "react";
import { Loader2, Send, Star, X } from "lucide-react";
import { useToast } from "@/components/ui/toast-provider";

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  restaurantId: string;
  onReviewSubmitted: () => void;
  primaryColor?: string;
}

export default function ReviewModal({
  isOpen,
  onClose,
  orderId,
  restaurantId,
  onReviewSubmitted,
  primaryColor = "#DC2626",
}: ReviewModalProps) {
  const { showToast } = useToast();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (rating === 0) {
      showToast({
        title: "Nota obrigatória",
        description: "Selecione de 1 a 5 estrelas para enviar a avaliação.",
        tone: "error",
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId,
          restaurantId,
          rating,
          comment,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Erro ao enviar avaliação.");
      }

      setRating(0);
      setHoverRating(0);
      setComment("");
      onReviewSubmitted();
      onClose();
      showToast({
        title: "Avaliação enviada",
        description: "Obrigado por compartilhar sua experiência.",
        tone: "success",
      });
    } catch (error: any) {
      console.error(error);
      showToast({
        title: "Não foi possível enviar a avaliação",
        description: error.message || "Tente novamente em instantes.",
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 p-4">
          <h3 className="font-bold text-gray-800">Avaliar pedido</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col items-center p-6">
          <p className="mb-4 text-center text-sm text-gray-600">
            Como foi sua experiência com este pedido?
          </p>

          <div className="mb-6 flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(star)}
                className="transition-transform hover:scale-110 focus:outline-none"
              >
                <Star
                  size={32}
                  fill={(hoverRating || rating) >= star ? "#EAB308" : "none"}
                  className={(hoverRating || rating) >= star ? "text-yellow-500" : "text-gray-300"}
                />
              </button>
            ))}
          </div>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Deixe um comentário opcional..."
            className="mb-4 min-h-[100px] w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm focus:border-yellow-500 focus:outline-none"
          />

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3 font-bold text-white shadow-lg hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: primaryColor }}
          >
            {submitting ? <Loader2 className="animate-spin" size={20} /> : <Send size={18} />}
            Enviar avaliação
          </button>
        </div>
      </div>
    </div>
  );
}
