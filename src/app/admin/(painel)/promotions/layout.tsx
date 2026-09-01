import PromotionsTabs from "./PromotionsTabs";

export default function PromotionsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PromotionsTabs />
      {children}
    </>
  );
}
