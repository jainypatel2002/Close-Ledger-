"use client";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Store } from "@/lib/types";
import { ClosingFormValues } from "@/lib/validation/closing";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value ?? 0);

export const generateOfflineClosingPdf = async ({
  store,
  closing,
  totals
}: {
  store: Store;
  closing: ClosingFormValues;
  totals: {
    gross_collected: number;
    true_revenue: number;
    tax_amount: number;
  };
}) => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);

  page.drawRectangle({ x: 0, y: 730, width: 612, height: 62, color: rgb(0.08, 0.08, 0.1) });
  page.drawText(store.store_name, { x: 24, y: 760, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText(`${closing.business_date} · OFFLINE PDF`, {
    x: 24,
    y: 744,
    size: 10,
    font: normal,
    color: rgb(0.82, 0.82, 0.85)
  });

  let y = 700;
  const rows: Array<[string, string]> = [
    ["Status", closing.status],
    ["Gross collected", money(totals.gross_collected)],
    ["True revenue", money(totals.true_revenue)],
    ["Tax amount", money(totals.tax_amount)],
    ["Cash", money(closing.cash_amount)],
    ["Card", money(closing.card_amount)],
    ["EBT", money(closing.ebt_amount)],
    ["Other", money(closing.other_amount)]
  ];

  rows.forEach(([label, value]) => {
    page.drawText(label, { x: 24, y, size: 11, font: normal });
    page.drawText(value, { x: 190, y, size: 11, font: bold });
    y -= 18;
  });

  page.drawText("Notes", { x: 24, y: 510, size: 12, font: bold });
  page.drawText(closing.notes || "No notes.", {
    x: 24,
    y: 494,
    size: 10,
    font: normal,
    maxWidth: 560,
    lineHeight: 12
  });

  return doc.save();
};

export const downloadPdfBytes = (bytes: Uint8Array, fileName: string) => {
  const blob = new Blob([Uint8Array.from(bytes).buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};
