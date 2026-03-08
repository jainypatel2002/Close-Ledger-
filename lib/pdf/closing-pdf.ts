import { format } from "date-fns";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const PAGE_MARGIN = 32;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const FOOTER_HEIGHT = 20;

const COLORS = {
  paper: rgb(1, 1, 1),
  ink: rgb(0.08, 0.08, 0.1),
  text: rgb(0.16, 0.16, 0.18),
  muted: rgb(0.43, 0.43, 0.48),
  line: rgb(0.85, 0.85, 0.88),
  panel: rgb(0.97, 0.97, 0.98),
  panelAlt: rgb(0.94, 0.94, 0.96),
  accent: rgb(0.56, 0.09, 0.16),
  accentSoft: rgb(0.97, 0.93, 0.94),
  accentMuted: rgb(0.78, 0.22, 0.28),
  successSoft: rgb(0.91, 0.95, 0.92),
  warningSoft: rgb(0.98, 0.95, 0.9)
};

type ChartSlice = { name: string; value: number };

type PaymentRow = {
  payment_type?: string;
  label?: string;
  amount?: number;
};

type LotteryRow = {
  display_number_snapshot?: number;
  lottery_name_snapshot?: string;
  ticket_price_snapshot?: number;
  start_number?: number;
  end_number?: number;
  tickets_sold?: number;
  sales_amount?: number;
  payouts?: number;
  game_name?: string;
  start_ticket_number?: number;
  end_ticket_number?: number;
  ticket_price?: number;
  tickets_sold_computed?: number;
  scratch_sales?: number;
  scratch_payouts?: number;
  net_amount?: number;
};

type BillpayRow = {
  provider_name: string;
  amount_collected: number;
  fee_revenue: number;
  txn_count: number;
};

type VendorPayoutRow = {
  vendor?: string | null;
  product_description?: string | null;
  category?: string | null;
  quantity?: number | null;
  unit_cost?: number | null;
  amount_paid?: number | null;
  notes?: string | null;
};

export interface ClosingPdfInput {
  store: {
    id?: string;
    store_name: string;
    legal_name?: string | null;
    address_line1: string;
    address_line2: string | null;
    city: string;
    state: string;
    zip: string;
    phone: string | null;
    email?: string | null;
    header_text: string | null;
  };
  closing: {
    id: string;
    store_id?: string;
    business_date: string;
    status: string;
    gross_collected: number;
    true_revenue: number;
    total_sales_gross: number;
    taxable_sales: number;
    non_taxable_sales: number;
    tax_rate_used?: number;
    tax_amount: number;
    draw_sales: number;
    draw_payouts: number;
    lottery_total_scratch_revenue: number;
    lottery_online_amount: number;
    lottery_paid_out_amount: number;
    lottery_amount_due: number;
    lottery_total_sales: number;
    lottery_total_payouts: number;
    lottery_net: number;
    billpay_collected_total: number;
    billpay_fee_revenue: number;
    billpay_transactions_count?: number;
    cash_amount: number;
    card_amount: number;
    ebt_amount: number;
    other_amount: number;
    payments_total?: number;
    notes: string | null;
    created_at?: string;
  };
  lotteryLines: LotteryRow[];
  billpayLines: BillpayRow[];
  paymentLines: PaymentRow[];
  vendorPayouts?: VendorPayoutRow[];
  chartData?: {
    gross?: ChartSlice[];
    payments?: ChartSlice[];
  };
  generatedAtIso?: string;
  sourceLabel?: string;
}

interface BoxArea {
  x: number;
  top: number;
  width: number;
  height: number;
}

interface TableColumn<T> {
  header: string;
  width: number;
  align?: "left" | "right" | "center";
  value: (row: T) => string;
}

interface WrappedLine {
  text: string;
  width: number;
}

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value ?? 0);

const numberValue = (value: unknown) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const topToY = (top: number, height = 0) => PAGE_HEIGHT - top - height;

const drawTextTop = (
  page: PDFPage,
  text: string,
  {
    x,
    top,
    size,
    font,
    color = COLORS.text
  }: {
    x: number;
    top: number;
    size: number;
    font: PDFFont;
    color?: ReturnType<typeof rgb>;
  }
) => {
  page.drawText(text, {
    x,
    y: topToY(top, size),
    size,
    font,
    color
  });
};

const drawRectTop = (
  page: PDFPage,
  {
    x,
    top,
    width,
    height,
    color,
    borderColor = COLORS.line,
    borderWidth = 1
  }: {
    x: number;
    top: number;
    width: number;
    height: number;
    color: ReturnType<typeof rgb>;
    borderColor?: ReturnType<typeof rgb>;
    borderWidth?: number;
  }
) => {
  page.drawRectangle({
    x,
    y: topToY(top, height),
    width,
    height,
    color,
    borderColor,
    borderWidth
  });
};

const drawRule = (page: PDFPage, x: number, top: number, width: number) => {
  page.drawLine({
    start: { x, y: topToY(top) },
    end: { x: x + width, y: topToY(top) },
    thickness: 1,
    color: COLORS.line
  });
};

const wrapText = (
  text: string,
  maxWidth: number,
  font: PDFFont,
  size: number,
  maxLines: number
): WrappedLine[] => {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) {
    return [];
  }

  const lines: WrappedLine[] = [];
  let current = "";

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, size);
    if (!current || width <= maxWidth) {
      current = candidate;
      return;
    }
    lines.push({ text: current, width: font.widthOfTextAtSize(current, size) });
    current = word;
  });

  if (current) {
    lines.push({ text: current, width: font.widthOfTextAtSize(current, size) });
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  const truncated = lines.slice(0, maxLines);
  const last = truncated[maxLines - 1];
  let lastText = last.text;
  while (lastText.length > 0) {
    const candidate = `${lastText}...`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      truncated[maxLines - 1] = {
        text: candidate,
        width: font.widthOfTextAtSize(candidate, size)
      };
      break;
    }
    lastText = lastText.slice(0, -1).trimEnd();
  }
  return truncated;
};

const drawWrappedTextTop = (
  page: PDFPage,
  text: string,
  {
    x,
    top,
    width,
    size,
    lineHeight,
    maxLines,
    font,
    color = COLORS.text
  }: {
    x: number;
    top: number;
    width: number;
    size: number;
    lineHeight: number;
    maxLines: number;
    font: PDFFont;
    color?: ReturnType<typeof rgb>;
  }
) => {
  const lines = wrapText(text, width, font, size, maxLines);
  lines.forEach((line, index) => {
    drawTextTop(page, line.text, {
      x,
      top: top + index * lineHeight,
      size,
      font,
      color
    });
  });
  return lines.length;
};

const sectionBox = (
  page: PDFPage,
  area: BoxArea,
  title: string,
  bold: PDFFont,
  font: PDFFont
) => {
  drawRectTop(page, {
    x: area.x,
    top: area.top,
    width: area.width,
    height: area.height,
    color: COLORS.paper,
    borderColor: COLORS.line
  });
  drawRectTop(page, {
    x: area.x,
    top: area.top,
    width: area.width,
    height: 26,
    color: COLORS.panelAlt,
    borderColor: COLORS.line
  });
  drawTextTop(page, title, {
    x: area.x + 14,
    top: area.top + 8,
    size: 10,
    font: bold,
    color: COLORS.ink
  });
  drawTextTop(page, "Structured closing report", {
    x: area.x + area.width - 120,
    top: area.top + 8,
    size: 7,
    font,
    color: COLORS.muted
  });
};

const metricCard = (
  page: PDFPage,
  {
    x,
    top,
    width,
    height,
    label,
    value,
    accent = false
  }: {
    x: number;
    top: number;
    width: number;
    height: number;
    label: string;
    value: string;
    accent?: boolean;
  },
  font: PDFFont,
  bold: PDFFont
) => {
  drawRectTop(page, {
    x,
    top,
    width,
    height,
    color: accent ? COLORS.accentSoft : COLORS.panel,
    borderColor: accent ? COLORS.accentMuted : COLORS.line
  });
  drawTextTop(page, label, {
    x: x + 14,
    top: top + 10,
    size: 8,
    font,
    color: COLORS.muted
  });
  drawTextTop(page, value, {
    x: x + 14,
    top: top + 26,
    size: 15,
    font: bold,
    color: accent ? COLORS.accent : COLORS.ink
  });
};

const alignTextX = (
  value: string,
  columnX: number,
  width: number,
  font: PDFFont,
  size: number,
  align: "left" | "right" | "center"
) => {
  if (align === "left") {
    return columnX;
  }
  const textWidth = font.widthOfTextAtSize(value, size);
  if (align === "center") {
    return columnX + (width - textWidth) / 2;
  }
  return columnX + width - textWidth;
};

const drawTable = <T,>(
  page: PDFPage,
  {
    x,
    top,
    width,
    columns,
    rows,
    rowHeight = 18,
    font,
    bold,
    emptyMessage
  }: {
    x: number;
    top: number;
    width: number;
    columns: TableColumn<T>[];
    rows: T[];
    rowHeight?: number;
    font: PDFFont;
    bold: PDFFont;
    emptyMessage: string;
  }
) => {
  const headerHeight = 22;
  drawRectTop(page, {
    x,
    top,
    width,
    height: headerHeight,
    color: COLORS.panelAlt,
    borderColor: COLORS.line
  });

  let cursorX = x + 10;
  columns.forEach((column) => {
    drawTextTop(page, column.header, {
      x: alignTextX(column.header, cursorX, column.width - 12, bold, 8, column.align ?? "left"),
      top: top + 7,
      size: 8,
      font: bold,
      color: COLORS.ink
    });
    cursorX += column.width;
  });

  if (rows.length === 0) {
    drawRectTop(page, {
      x,
      top: top + headerHeight,
      width,
      height: rowHeight,
      color: COLORS.paper,
      borderColor: COLORS.line
    });
    drawTextTop(page, emptyMessage, {
      x: x + 10,
      top: top + headerHeight + 5,
      size: 8,
      font,
      color: COLORS.muted
    });
    return top + headerHeight + rowHeight;
  }

  rows.forEach((row, rowIndex) => {
    const rowTop = top + headerHeight + rowIndex * rowHeight;
    drawRectTop(page, {
      x,
      top: rowTop,
      width,
      height: rowHeight,
      color: rowIndex % 2 === 0 ? COLORS.paper : COLORS.panel,
      borderColor: COLORS.line
    });
    let rowX = x + 10;
    columns.forEach((column) => {
      const value = column.value(row);
      const align = column.align ?? "left";
      drawTextTop(page, value, {
        x: alignTextX(value, rowX, column.width - 12, font, 8, align),
        top: rowTop + 5,
        size: 8,
        font,
        color: COLORS.text
      });
      rowX += column.width;
    });
  });

  return top + headerHeight + rows.length * rowHeight;
};

const chunk = <T,>(rows: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks.length > 0 ? chunks : [[]];
};

const paymentTypeLabel = (type: string) => {
  if (type === "ebt") {
    return "EBT";
  }
  return type.charAt(0).toUpperCase() + type.slice(1);
};

const normalizePaymentRows = (input: ClosingPdfInput) => {
  const explicitRows = input.paymentLines
    .map((line) => ({
      payment_type: String(line.payment_type ?? "other").toLowerCase(),
      label: String(line.label ?? "Payment"),
      amount: numberValue(line.amount)
    }))
    .filter((line) => line.payment_type === "cash" || line.payment_type === "card" || line.payment_type === "ebt" || line.payment_type === "other");

  if (explicitRows.length > 0) {
    return explicitRows;
  }

  return [
    { payment_type: "cash", label: "Cash", amount: numberValue(input.closing.cash_amount) },
    { payment_type: "card", label: "Card", amount: numberValue(input.closing.card_amount) },
    { payment_type: "ebt", label: "EBT", amount: numberValue(input.closing.ebt_amount) },
    { payment_type: "other", label: "Other", amount: numberValue(input.closing.other_amount) }
  ];
};

const normalizeLotteryRows = (rows: LotteryRow[]) =>
  rows.map((row, index) => {
    const amount = numberValue(row.ticket_price_snapshot ?? row.ticket_price);
    const start = numberValue(row.start_number ?? row.start_ticket_number);
    const end = numberValue(row.end_number ?? row.end_ticket_number);
    const sold = numberValue(row.tickets_sold ?? row.tickets_sold_computed);
    const revenue = numberValue(row.sales_amount ?? row.scratch_sales ?? sold * amount);
    const payouts = numberValue(row.payouts ?? row.scratch_payouts);

    return {
      display: numberValue(row.display_number_snapshot ?? index + 1),
      name: String(row.lottery_name_snapshot ?? row.game_name ?? `Lottery ${index + 1}`),
      amount,
      start,
      end,
      sold,
      revenue,
      payouts
    };
  });

const buildSummaryMetrics = (input: ClosingPdfInput) => {
  const paymentsTotal =
    input.closing.payments_total ??
    numberValue(input.closing.cash_amount) +
      numberValue(input.closing.card_amount) +
      numberValue(input.closing.ebt_amount) +
      numberValue(input.closing.other_amount);

  return [
    { label: "Gross Collected", value: money(numberValue(input.closing.gross_collected)), accent: true },
    { label: "True Revenue", value: money(numberValue(input.closing.true_revenue)), accent: true },
    { label: "Taxable Sales", value: money(numberValue(input.closing.taxable_sales)) },
    { label: "Non-Taxable Sales", value: money(numberValue(input.closing.non_taxable_sales)) },
    { label: "Tax Amount", value: money(numberValue(input.closing.tax_amount)) },
    { label: "Scratch Revenue", value: money(numberValue(input.closing.lottery_total_scratch_revenue)) },
    { label: "Lottery Online", value: money(numberValue(input.closing.lottery_online_amount)) },
    { label: "Lottery Paid Out", value: money(numberValue(input.closing.lottery_paid_out_amount)) },
    { label: "Lottery Amount Due", value: money(numberValue(input.closing.lottery_amount_due)), accent: true },
    { label: "Billpay Collected", value: money(numberValue(input.closing.billpay_collected_total)) },
    { label: "Billpay Fee Revenue", value: money(numberValue(input.closing.billpay_fee_revenue)) },
    { label: "Payments Total", value: money(numberValue(paymentsTotal)) }
  ];
};

const drawHeader = (
  page: PDFPage,
  input: ClosingPdfInput,
  generatedAtIso: string,
  pageTitle: string,
  bold: PDFFont,
  font: PDFFont
) => {
  drawRectTop(page, {
    x: 0,
    top: 0,
    width: PAGE_WIDTH,
    height: 92,
    color: COLORS.ink,
    borderColor: COLORS.ink,
    borderWidth: 0
  });
  drawRectTop(page, {
    x: 0,
    top: 88,
    width: PAGE_WIDTH,
    height: 4,
    color: COLORS.accent,
    borderColor: COLORS.accent,
    borderWidth: 0
  });

  drawTextTop(page, input.store.store_name, {
    x: PAGE_MARGIN,
    top: 20,
    size: 24,
    font: bold,
    color: COLORS.paper
  });
  drawTextTop(page, pageTitle, {
    x: PAGE_MARGIN,
    top: 49,
    size: 11,
    font,
    color: rgb(0.9, 0.9, 0.92)
  });

  const detailParts = [
    input.store.address_line1,
    input.store.address_line2,
    `${input.store.city}, ${input.store.state} ${input.store.zip}`,
    input.store.phone ?? undefined
  ].filter(Boolean);
  drawTextTop(page, detailParts.join("  |  "), {
    x: PAGE_MARGIN,
    top: 66,
    size: 9,
    font,
    color: rgb(0.82, 0.82, 0.86)
  });

  const metaX = PAGE_WIDTH - PAGE_MARGIN - 210;
  const metaRows = [
    ["Closing Date", input.closing.business_date],
    ["Generated", format(new Date(generatedAtIso), "yyyy-MM-dd HH:mm:ss")],
    ["Source", input.sourceLabel ?? "SERVER PDF"]
  ] as const;

  metaRows.forEach(([label, value], index) => {
    drawTextTop(page, label, {
      x: metaX,
      top: 20 + index * 18,
      size: 8,
      font,
      color: rgb(0.75, 0.75, 0.79)
    });
    drawTextTop(page, value, {
      x: metaX + 72,
      top: 20 + index * 18,
      size: 8,
      font: bold,
      color: COLORS.paper
    });
  });

  const badgeWidth = 94;
  drawRectTop(page, {
    x: PAGE_WIDTH - PAGE_MARGIN - badgeWidth,
    top: 18,
    width: badgeWidth,
    height: 26,
    color:
      input.closing.status === "LOCKED"
        ? COLORS.warningSoft
        : input.closing.status === "FINALIZED"
          ? COLORS.successSoft
          : COLORS.accentSoft,
    borderColor: COLORS.paper
  });
  drawTextTop(page, input.closing.status, {
    x: PAGE_WIDTH - PAGE_MARGIN - badgeWidth + 14,
    top: 26,
    size: 10,
    font: bold,
    color: COLORS.ink
  });
};

const addFooter = (
  page: PDFPage,
  pageNumber: number,
  totalPages: number,
  input: ClosingPdfInput,
  font: PDFFont
) => {
  drawRule(page, PAGE_MARGIN, PAGE_HEIGHT - FOOTER_HEIGHT - 8, CONTENT_WIDTH);
  drawTextTop(page, "Generated by Close Ledger", {
    x: PAGE_MARGIN,
    top: PAGE_HEIGHT - FOOTER_HEIGHT,
    size: 8,
    font,
    color: COLORS.muted
  });
  drawTextTop(page, `Store ${input.store.id ?? input.closing.store_id ?? "N/A"}  |  Closing ${input.closing.id}`, {
    x: PAGE_MARGIN + 170,
    top: PAGE_HEIGHT - FOOTER_HEIGHT,
    size: 8,
    font,
    color: COLORS.muted
  });
  drawTextTop(page, `Page ${pageNumber} of ${totalPages}`, {
    x: PAGE_WIDTH - PAGE_MARGIN - 64,
    top: PAGE_HEIGHT - FOOTER_HEIGHT,
    size: 8,
    font,
    color: COLORS.muted
  });
};

export const generateClosingPdf = async (input: ClosingPdfInput) => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const generatedAtIso = input.generatedAtIso ?? new Date().toISOString();

  const summaryPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawHeader(summaryPage, input, generatedAtIso, "Nightly Closing Report", bold, font);

  drawTextTop(summaryPage, "Summary", {
    x: PAGE_MARGIN,
    top: 110,
    size: 12,
    font: bold,
    color: COLORS.ink
  });
  drawTextTop(summaryPage, "Gross collected includes configured pass-through amounts. True revenue reflects earned revenue.", {
    x: PAGE_MARGIN + 72,
    top: 112,
    size: 8,
    font,
    color: COLORS.muted
  });

  const metricWidth = (CONTENT_WIDTH - 24) / 3;
  const metricHeight = 54;
  buildSummaryMetrics(input).forEach((metric, index) => {
    const row = Math.floor(index / 3);
    const column = index % 3;
    metricCard(
      summaryPage,
      {
        x: PAGE_MARGIN + column * (metricWidth + 12),
        top: 130 + row * (metricHeight + 10),
        width: metricWidth,
        height: metricHeight,
        label: metric.label,
        value: metric.value,
        accent: metric.accent
      },
      font,
      bold
    );
  });

  const definitionBox: BoxArea = {
    x: PAGE_MARGIN,
    top: 386,
    width: (CONTENT_WIDTH - 14) / 2,
    height: 145
  };
  sectionBox(summaryPage, definitionBox, "Revenue Definitions", bold, font);
  const definitionRows = [
    ["Gross Collected", "Product sales plus configured lottery and billpay pass-through collections."],
    ["True Revenue", "Earned revenue after lottery payouts, plus billpay fees and product sales."],
    ["Lottery Amount Due", "Scratch revenue minus payouts, plus online lottery sales."],
    ["Billpay Fee Revenue", "Only the earned commission or fee portion of billpay collections."]
  ] as const;
  definitionRows.forEach(([label, value], index) => {
    const rowTop = definitionBox.top + 38 + index * 24;
    drawTextTop(summaryPage, label, {
      x: definitionBox.x + 14,
      top: rowTop,
      size: 8,
      font: bold,
      color: COLORS.ink
    });
    drawWrappedTextTop(summaryPage, value, {
      x: definitionBox.x + 110,
      top: rowTop,
      width: definitionBox.width - 124,
      size: 8,
      lineHeight: 10,
      maxLines: 2,
      font,
      color: COLORS.text
    });
  });

  const notesBox: BoxArea = {
    x: PAGE_MARGIN + definitionBox.width + 14,
    top: 386,
    width: (CONTENT_WIDTH - 14) / 2,
    height: 145
  };
  sectionBox(summaryPage, notesBox, "Notes", bold, font);
  const noteText = input.closing.notes?.trim() || "No notes.";
  drawWrappedTextTop(summaryPage, noteText, {
    x: notesBox.x + 14,
    top: notesBox.top + 40,
    width: notesBox.width - 28,
    size: 9,
    lineHeight: 13,
    maxLines: 7,
    font,
    color: noteText === "No notes." ? COLORS.muted : COLORS.text
  });

  const paymentRows = normalizePaymentRows(input);
  const paymentBreakdownBox: BoxArea = {
    x: PAGE_MARGIN,
    top: 536,
    width: CONTENT_WIDTH,
    height: 18
  };
  drawTextTop(summaryPage, "Prepared for print and archival storage.", {
    x: paymentBreakdownBox.x,
    top: paymentBreakdownBox.top,
    size: 8,
    font,
    color: COLORS.muted
  });
  drawTextTop(summaryPage, `Cash ${money(numberValue(input.closing.cash_amount))}  |  Card ${money(numberValue(input.closing.card_amount))}  |  EBT ${money(numberValue(input.closing.ebt_amount))}  |  Other ${money(numberValue(input.closing.other_amount))}`, {
    x: paymentBreakdownBox.x + 238,
    top: paymentBreakdownBox.top,
    size: 8,
    font: bold,
    color: COLORS.ink
  });

  const lotteryRows = normalizeLotteryRows(input.lotteryLines);
  const lotteryChunks = chunk(lotteryRows, 8);
  const detailPages = lotteryChunks.map(() => pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]));

  detailPages.forEach((page, pageIndex) => {
    drawHeader(page, input, generatedAtIso, pageIndex === 0 ? "Closing Detail Sections" : "Closing Detail Sections (Continued)", bold, font);

    const tableTop = 110;
    const tableArea: BoxArea = {
      x: PAGE_MARGIN,
      top: tableTop,
      width: CONTENT_WIDTH,
      height: 280
    };
    sectionBox(page, tableArea, "Lottery Breakdown", bold, font);

    const tableBottomTop = drawTable(page, {
      x: tableArea.x + 14,
      top: tableArea.top + 38,
      width: tableArea.width - 28,
      columns: [
        { header: "#", width: 44, align: "center", value: (row) => String(row.display) },
        { header: "Lottery Name", width: 238, value: (row) => row.name.slice(0, 28) },
        { header: "Amount", width: 88, align: "right", value: (row) => money(row.amount) },
        { header: "Start", width: 66, align: "right", value: (row) => String(row.start) },
        { header: "End", width: 66, align: "right", value: (row) => String(row.end) },
        { header: "Sold", width: 66, align: "right", value: (row) => String(row.sold) },
        { header: "Revenue", width: 92, align: "right", value: (row) => money(row.revenue) }
      ],
      rows: lotteryChunks[pageIndex],
      font,
      bold,
      emptyMessage: "No lottery rows recorded for this closing."
    });

    const isLastLotteryPage = pageIndex === detailPages.length - 1;
    if (!isLastLotteryPage) {
      return;
    }

    const summaryStripeTop = Math.min(tableBottomTop + 14, tableArea.top + tableArea.height - 58);
    const summaryStripeWidth = (tableArea.width - 42) / 4;
    [
      { label: "Total Scratch Revenue", value: numberValue(input.closing.lottery_total_scratch_revenue) },
      { label: "Online", value: numberValue(input.closing.lottery_online_amount) },
      { label: "Paid Out", value: numberValue(input.closing.lottery_paid_out_amount) },
      { label: "Amount Due", value: numberValue(input.closing.lottery_amount_due) }
    ].forEach((metric, index) => {
      metricCard(
        page,
        {
          x: tableArea.x + 14 + index * (summaryStripeWidth + 8),
          top: summaryStripeTop,
          width: summaryStripeWidth,
          height: 42,
          label: metric.label,
          value: money(metric.value),
          accent: metric.label === "Amount Due"
        },
        font,
        bold
      );
    });

    const bottomSectionTop = 388;
    const leftSectionWidth = (CONTENT_WIDTH - 14) / 2;
    const taxPaymentBox: BoxArea = {
      x: PAGE_MARGIN,
      top: bottomSectionTop,
      width: leftSectionWidth,
      height: 145
    };
    sectionBox(page, taxPaymentBox, "Payments & Tax", bold, font);

    [
      ["Taxable Sales", money(numberValue(input.closing.taxable_sales))],
      ["Non-Taxable Sales", money(numberValue(input.closing.non_taxable_sales))],
      ["Tax Rate", `${(numberValue(input.closing.tax_rate_used) * 100).toFixed(2)}%`],
      ["Tax Amount", money(numberValue(input.closing.tax_amount))]
    ].forEach(([label, value], index) => {
      drawTextTop(page, label, {
        x: taxPaymentBox.x + 14,
        top: taxPaymentBox.top + 38 + index * 18,
        size: 8,
        font,
        color: COLORS.muted
      });
      drawTextTop(page, value, {
        x: taxPaymentBox.x + 132,
        top: taxPaymentBox.top + 38 + index * 18,
        size: 8,
        font: bold,
        color: COLORS.ink
      });
    });

    drawRule(page, taxPaymentBox.x + 14, taxPaymentBox.top + 112, taxPaymentBox.width - 28);
    drawTextTop(page, "Payment Breakdown", {
      x: taxPaymentBox.x + 14,
      top: taxPaymentBox.top + 120,
      size: 8,
      font: bold,
      color: COLORS.ink
    });
    paymentRows.slice(0, 4).forEach((row, index) => {
      drawTextTop(page, paymentTypeLabel(row.payment_type), {
        x: taxPaymentBox.x + 14,
        top: taxPaymentBox.top + 136 + index * 14,
        size: 8,
        font,
        color: COLORS.text
      });
      drawTextTop(page, row.label, {
        x: taxPaymentBox.x + 82,
        top: taxPaymentBox.top + 136 + index * 14,
        size: 8,
        font,
        color: COLORS.text
      });
      drawTextTop(page, money(numberValue(row.amount)), {
        x: taxPaymentBox.x + taxPaymentBox.width - 86,
        top: taxPaymentBox.top + 136 + index * 14,
        size: 8,
        font: bold,
        color: COLORS.ink
      });
    });

    const rightSectionX = PAGE_MARGIN + leftSectionWidth + 14;
    const billpayBox: BoxArea = {
      x: rightSectionX,
      top: bottomSectionTop,
      width: leftSectionWidth,
      height: 145
    };
    sectionBox(page, billpayBox, "Billpay", bold, font);
    const totalBillpayTransactions =
      input.closing.billpay_transactions_count ??
      input.billpayLines.reduce((sum, row) => sum + Math.max(0, Math.floor(numberValue(row.txn_count))), 0);
    [
      ["Collected Total", money(numberValue(input.closing.billpay_collected_total))],
      ["Fee Revenue", money(numberValue(input.closing.billpay_fee_revenue))],
      ["Transaction Count", String(totalBillpayTransactions)]
    ].forEach(([label, value], index) => {
      drawTextTop(page, label, {
        x: billpayBox.x + 14,
        top: billpayBox.top + 38 + index * 18,
        size: 8,
        font,
        color: COLORS.muted
      });
      drawTextTop(page, value, {
        x: billpayBox.x + 124,
        top: billpayBox.top + 38 + index * 18,
        size: 8,
        font: bold,
        color: COLORS.ink
      });
    });

    drawRule(page, billpayBox.x + 14, billpayBox.top + 96, billpayBox.width - 28);
    input.billpayLines.slice(0, 4).forEach((row, index) => {
      drawTextTop(page, row.provider_name, {
        x: billpayBox.x + 14,
        top: billpayBox.top + 106 + index * 14,
        size: 8,
        font,
        color: COLORS.text
      });
      drawTextTop(page, money(numberValue(row.amount_collected)), {
        x: billpayBox.x + billpayBox.width - 154,
        top: billpayBox.top + 106 + index * 14,
        size: 8,
        font,
        color: COLORS.text
      });
      drawTextTop(page, money(numberValue(row.fee_revenue)), {
        x: billpayBox.x + billpayBox.width - 78,
        top: billpayBox.top + 106 + index * 14,
        size: 8,
        font: bold,
        color: COLORS.ink
      });
    });

  });

  if ((input.vendorPayouts ?? []).length > 0) {
    const vendorPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawHeader(vendorPage, input, generatedAtIso, "Vendor Payouts", bold, font);
    const vendorBox: BoxArea = {
      x: PAGE_MARGIN,
      top: 110,
      width: CONTENT_WIDTH,
      height: 380
    };
    sectionBox(vendorPage, vendorBox, "Vendor Payouts", bold, font);
    drawTable(vendorPage, {
      x: vendorBox.x + 14,
      top: vendorBox.top + 38,
      width: vendorBox.width - 28,
      columns: [
        { header: "Vendor", width: 120, value: (row) => String(row.vendor ?? "Vendor") },
        {
          header: "Product/Description",
          width: 188,
          value: (row) => String(row.product_description ?? "")
        },
        { header: "Category", width: 92, value: (row) => String(row.category ?? "") },
        {
          header: "Qty",
          width: 48,
          align: "right",
          value: (row) => String(numberValue(row.quantity))
        },
        {
          header: "Unit Cost",
          width: 84,
          align: "right",
          value: (row) => money(numberValue(row.unit_cost))
        },
        {
          header: "Amount Paid",
          width: 92,
          align: "right",
          value: (row) => money(numberValue(row.amount_paid))
        },
        { header: "Notes", width: 132, value: (row) => String(row.notes ?? "") }
      ],
      rows: (input.vendorPayouts ?? []).slice(0, 10),
      font,
      bold,
      emptyMessage: "No vendor payouts recorded."
    });
  }

  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    addFooter(page, index + 1, pages.length, input, font);
  });

  return pdf.save({ useObjectStreams: false });
};
