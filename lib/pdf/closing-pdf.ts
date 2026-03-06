import { PDFFont, PDFPage, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { format } from "date-fns";

type ChartSlice = { name: string; value: number; color?: [number, number, number] };

interface PdfInput {
  store: {
    store_name: string;
    address_line1: string;
    address_line2: string | null;
    city: string;
    state: string;
    zip: string;
    phone: string | null;
    header_text: string | null;
  };
  closing: {
    id: string;
    business_date: string;
    status: string;
    gross_collected: number;
    true_revenue: number;
    total_sales_gross: number;
    taxable_sales: number;
    non_taxable_sales: number;
    tax_amount: number;
    draw_sales: number;
    draw_payouts: number;
    lottery_total_sales: number;
    lottery_total_payouts: number;
    lottery_net: number;
    billpay_collected_total: number;
    billpay_fee_revenue: number;
    cash_amount: number;
    card_amount: number;
    ebt_amount: number;
    other_amount: number;
    notes: string | null;
    created_at: string;
  };
  lotteryLines: Array<{
    display_number_snapshot?: number;
    lottery_name_snapshot?: string;
    ticket_price_snapshot?: number;
    start_number?: number;
    end_number?: number;
    tickets_sold?: number;
    sales_amount?: number;
    payouts?: number;
    net_amount?: number;
    game_name?: string;
    start_ticket_number?: number;
    end_ticket_number?: number;
    ticket_price?: number;
    tickets_sold_computed?: number;
    scratch_sales?: number;
    scratch_payouts?: number;
  }>;
  billpayLines: Array<{
    provider_name: string;
    amount_collected: number;
    fee_revenue: number;
    txn_count: number;
  }>;
  chartData: {
    gross: ChartSlice[];
    payments: ChartSlice[];
  };
}

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value ?? 0);

const toRgb = (color?: [number, number, number]) =>
  color ? rgb(color[0], color[1], color[2]) : rgb(0.86, 0.16, 0.27);

const polarToCartesian = (cx: number, cy: number, radius: number, angle: number) => ({
  x: cx + radius * Math.cos(angle),
  y: cy + radius * Math.sin(angle)
});

const wedgePath = ({
  cx,
  cy,
  radius,
  startAngle,
  endAngle
}: {
  cx: number;
  cy: number;
  radius: number;
  startAngle: number;
  endAngle: number;
}) => {
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
};

const drawPieChart = (
  page: PDFPage,
  {
    x,
    y,
    radius,
    title,
    slices
  }: {
    x: number;
    y: number;
    radius: number;
    title: string;
    slices: ChartSlice[];
  },
  font: PDFFont
) => {
  const total = slices.reduce((sum, slice) => sum + Math.max(slice.value, 0), 0) || 1;
  page.drawText(title, { x, y: y + radius + 30, font, size: 11, color: rgb(0.1, 0.1, 0.1) });

  let angle = -Math.PI / 2;
  slices.forEach((slice, index) => {
    const value = Math.max(0, slice.value);
    const sweep = (value / total) * Math.PI * 2;
    if (sweep <= 0) {
      return;
    }
    page.drawSvgPath(
      wedgePath({
        cx: x + radius,
        cy: y + radius,
        radius,
        startAngle: angle,
        endAngle: angle + sweep
      }),
      {
        color:
          slice.color ? toRgb(slice.color) : [rgb(0.86, 0.16, 0.27), rgb(0.98, 0.31, 0.18), rgb(0.2, 0.62, 0.95), rgb(0.94, 0.74, 0.18)][index % 4]
      }
    );
    angle += sweep;
  });

  let legendY = y - 12;
  slices.forEach((slice, index) => {
    const color =
      slice.color
        ? toRgb(slice.color)
        : [rgb(0.86, 0.16, 0.27), rgb(0.98, 0.31, 0.18), rgb(0.2, 0.62, 0.95), rgb(0.94, 0.74, 0.18)][index % 4];
    page.drawRectangle({
      x,
      y: legendY,
      width: 10,
      height: 10,
      color
    });
    page.drawText(`${slice.name}: ${money(slice.value)}`, {
      x: x + 14,
      y: legendY + 1,
      size: 9,
      font,
      color: rgb(0.2, 0.2, 0.2)
    });
    legendY -= 14;
  });
};

export const generateClosingPdf = async (input: PdfInput) => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([842, 1191]); // A4 landscape-ish for wider charts
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawRectangle({
    x: 0,
    y: 1110,
    width: 842,
    height: 81,
    color: rgb(0.08, 0.08, 0.1)
  });
  page.drawText(input.store.store_name, {
    x: 32,
    y: 1148,
    size: 20,
    font: bold,
    color: rgb(1, 1, 1)
  });
  page.drawText(
    `${input.store.address_line1}${input.store.address_line2 ? `, ${input.store.address_line2}` : ""}, ${input.store.city}, ${input.store.state} ${input.store.zip}`,
    {
      x: 32,
      y: 1132,
      size: 10,
      font,
      color: rgb(0.86, 0.86, 0.89)
    }
  );
  page.drawText(
    `Generated ${format(new Date(), "yyyy-MM-dd HH:mm:ss")} · Closing date ${input.closing.business_date}`,
    {
      x: 32,
      y: 1118,
      size: 9,
      font,
      color: rgb(0.86, 0.86, 0.89)
    }
  );

  let cursor = 1080;
  const summaryRows: Array<[string, string]> = [
    ["Status", input.closing.status],
    ["Gross Collected", money(input.closing.gross_collected)],
    ["True Revenue", money(input.closing.true_revenue)],
    ["Taxable Sales", money(input.closing.taxable_sales)],
    ["Non-taxable Sales", money(input.closing.non_taxable_sales)],
    ["Tax Amount", money(input.closing.tax_amount)],
    ["Lottery Sales", money(input.closing.lottery_total_sales)],
    ["Lottery Payouts", money(input.closing.lottery_total_payouts)],
    ["Lottery Net", money(input.closing.lottery_net)],
    ["Billpay Collected", money(input.closing.billpay_collected_total)],
    ["Billpay Fee Revenue", money(input.closing.billpay_fee_revenue)]
  ];

  page.drawText("Summary", { x: 32, y: cursor, size: 13, font: bold, color: rgb(0.1, 0.1, 0.1) });
  cursor -= 18;
  summaryRows.forEach(([label, value]) => {
    page.drawText(label, { x: 32, y: cursor, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(value, { x: 250, y: cursor, size: 10, font: bold, color: rgb(0.2, 0.2, 0.2) });
    cursor -= 14;
  });

  page.drawText("Payment Breakdown", {
    x: 430,
    y: 1080,
    size: 13,
    font: bold,
    color: rgb(0.1, 0.1, 0.1)
  });
  const paymentRows: Array<[string, string]> = [
    ["Cash", money(input.closing.cash_amount)],
    ["Card", money(input.closing.card_amount)],
    ["EBT", money(input.closing.ebt_amount)],
    ["Other", money(input.closing.other_amount)]
  ];
  let paymentCursor = 1062;
  paymentRows.forEach(([label, value]) => {
    page.drawText(label, { x: 430, y: paymentCursor, size: 10, font });
    page.drawText(value, { x: 570, y: paymentCursor, size: 10, font: bold });
    paymentCursor -= 14;
  });

  page.drawText("Lottery Scratch Lines", {
    x: 32,
    y: 928,
    size: 13,
    font: bold,
    color: rgb(0.1, 0.1, 0.1)
  });
  let scratchCursor = 910;
  input.lotteryLines.slice(0, 12).forEach((line) => {
    const displayNumber = Number(line.display_number_snapshot ?? 0);
    const name = String(line.lottery_name_snapshot ?? line.game_name ?? "Lottery");
    const price = Number(line.ticket_price_snapshot ?? line.ticket_price ?? 0);
    const start = Number(line.start_number ?? line.start_ticket_number ?? 0);
    const end = Number(line.end_number ?? line.end_ticket_number ?? 0);
    const sold = Number(line.tickets_sold ?? line.tickets_sold_computed ?? 0);
    const sales = Number(line.sales_amount ?? line.scratch_sales ?? 0);
    const payouts = Number(line.payouts ?? line.scratch_payouts ?? 0);
    const net = Number(line.net_amount ?? sales - payouts);
    page.drawText(
      `${displayNumber > 0 ? `${displayNumber}. ` : ""}${name} · $${price.toFixed(2)} · ${start}-${end} · sold ${sold} · sales ${money(sales)} · payouts ${money(payouts)} · net ${money(net)}`,
      {
        x: 32,
        y: scratchCursor,
        size: 9,
        font
      }
    );
    scratchCursor -= 12;
  });

  page.drawText("Billpay Lines", {
    x: 430,
    y: 928,
    size: 13,
    font: bold,
    color: rgb(0.1, 0.1, 0.1)
  });
  let billpayCursor = 910;
  input.billpayLines.slice(0, 12).forEach((line) => {
    page.drawText(
      `${line.provider_name} · collected ${money(line.amount_collected)} · fee ${money(line.fee_revenue)} · txns ${line.txn_count}`,
      {
        x: 430,
        y: billpayCursor,
        size: 9,
        font
      }
    );
    billpayCursor -= 12;
  });

  drawPieChart(
    page,
    {
      x: 40,
      y: 600,
      radius: 80,
      title: "Gross Collected Breakdown",
      slices: input.chartData.gross
    },
    font
  );

  drawPieChart(
    page,
    {
      x: 410,
      y: 600,
      radius: 80,
      title: "Payment Method Breakdown",
      slices: input.chartData.payments
    },
    font
  );

  page.drawText("Notes", { x: 32, y: 480, size: 13, font: bold });
  const notesText = input.closing.notes?.trim() || "No notes.";
  page.drawText(notesText.slice(0, 900), {
    x: 32,
    y: 462,
    size: 10,
    lineHeight: 13,
    maxWidth: 760,
    font
  });

  return pdf.save();
};
