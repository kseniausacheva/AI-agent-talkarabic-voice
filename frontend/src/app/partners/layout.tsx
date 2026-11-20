import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "La Royal Event — Партнёры",
  description: "Внутренняя CRM La Royal Event: заявки поставщиков, проверка партнёров и история сотрудничества.",
};

export default function PartnersLayout({ children }: { children: ReactNode }) {
  return children;
}
