import type { Metadata } from "next";
import { OutubroRosaProductDetail } from "@/components/OutubroRosaProductDetail";

export const metadata: Metadata = {
  title: "Outubro Rosa | Brinde personalizado",
  description: "Configure um brinde personalizado da seleção Outubro Rosa e solicite o orçamento pelo WhatsApp.",
};

type CampaignProductPageProps = { params: Promise<{ code: string }> };

export default async function CampaignProductPage({ params }: CampaignProductPageProps) {
  const { code } = await params;
  return <OutubroRosaProductDetail code={decodeURIComponent(code)} />;
}
