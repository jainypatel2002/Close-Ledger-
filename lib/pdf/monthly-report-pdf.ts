import { format } from "date-fns";
import { PDFDocument, PDFPage, PDFFont, rgb, StandardFonts } from "pdf-lib";

interface ChartSlice {
  name: string;
  value: number;
  color: string;
}

interface MonthlyReportInput {
  store: {
    store_name: string;
    legal_name: string | null;
    address_line1: string;
    address_line2: string | null;
    city: string;
    state: string;
    zip: string;
    phone: string | null;
    email: string | null;
    header_text: string | null;
  };
  monthLabel: string;
  generatedAtIso: string;
  note: string;
  summaryRows: Array<[string, number]>;
  paymentRows: Array<{ name: string; amount: number; percent: number }>;
  taxRows: Array<[string, number]>;
  lotteryRows: Array<{
    display_number: number;
    lottery_name: string;
    total_tickets_sold: number;
    total_scratch_sales: number;
    total_scratch_payouts: number;
    total_scratch_net: number;
  }>;
  dailyRows: Array<{
    date: string;
    status: string;
    gross_collected: number;
    true_revenue: number;
    lottery_sales: number;
    billpay_collected: number;
    tax_amount: number;
    tickets_sold_total: number;
  }>;
  charts: {
    revenueCategories: ChartSlice[];
    paymentMethods: ChartSlice[];
    topLotteryTickets: Array<{ name: string; value: number }>;
  };
}

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value ?? 0);

const hexToRgb = (hex: string) => {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) {
    return rgb(0.86, 0.16, 0.27);
  }
  const r = Number.parseInt(clean.slice(0, 2), 16) / 255;
  const g = Number.parseInt(clean.slice(2, 4), 16) / 255;
  const b = Number.parseInt(clean.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
};

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
  font: PDFFont,
  bold: PDFFont
) => {
  const total = slices.reduce((acc, slice) => acc + Math.max(0, slice.value), 0) || 1;
  page.drawText(title, {
    x,
    y: y + radius + 22,
    size: 10,
    font: bold,
    color: rgb(0.12, 0.12, 0.12)
  });

  let angle = -Math.PI / 2;
  slices.forEach((slice) => {
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
      { color: hexToRgb(slice.color) }
    );

    angle += sweep;
  });

  let legendY = y - 6;
  slices.slice(0, 5).forEach((slice) => {
    page.drawRectangle({
      x,
      y: legendY,
      width: 8,
      height: 8,
      color: hexToRgb(slice.color)
    });
    page.drawText(`${slice.name}: ${money(slice.value)}`, {
      x: x + 12,
      y: legendY,
      size: 8,
      font,
      color: rgb(0.2, 0.2, 0.2)
    });
    legendY -= 11;
  });
};

const drawTopLotteryBars = (
  page: PDFPage,
  {
    x,
    y,
    width,
    height,
    rows
  }: {
    x: number;
    y: number;
    width: number;
    height: number;
    rows: Array<{ name: string; value: number }>;
  },
  font: PDFFont,
  bold: PDFFont
) => {
  page.drawText("Top Lottery Tickets Sold", {
    x,
    y: y + height + 16,
    size: 10,
    font: bold,
    color: rgb(0.12, 0.12, 0.12)
  });

  const topRows = rows.slice(0, 6);
  const maxValue = Math.max(1, ...topRows.map((row) => row.value));
  const rowHeight = height / Math.max(1, topRows.length);

  topRows.forEach((row, index) => {
    const ratio = row.value / maxValue;
    const barWidth = ratio * (width - 140);
    const rowY = y + height - rowHeight * (index + 1) + 6;

    page.drawText(row.name.slice(0, 16), {
      x,
      y: rowY + 2,
      size: 8,
      font,
      color: rgb(0.22, 0.22, 0.22)
    });
    page.drawRectangle({
      x: x + 88,
      y: rowY,
      width: barWidth,
      height: 8,
      color: rgb(0.86, 0.16, 0.27)
    });
    page.drawText(String(row.value), {
      x: x + 94 + barWidth,
      y: rowY + 1,
      size: 8,
      font,
      color: rgb(0.22, 0.22, 0.22)
    });
  });
};

export const generateMonthlyReportPdf = async (input: MonthlyReportInput) => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const page = pdf.addPage([842, 1191]);
  page.drawRectangle({
    x: 0,
    y: 1108,
    width: 842,
    height: 83,
    color: rgb(0.08, 0.08, 0.1)
  });

  page.drawText(`${input.store.store_name} · Monthly Report`, {
    x: 28,
    y: 1148,
    size: 20,
    font: bold,
    color: rgb(1, 1, 1)
  });
  page.drawText(
    `${input.store.address_line1}${input.store.address_line2 ? `, ${input.store.address_line2}` : ""}, ${input.store.city}, ${input.store.state} ${input.store.zip}`,
    {
      x: 28,
      y: 1132,
      size: 9,
      font,
      color: rgb(0.86, 0.86, 0.89)
    }
  );
  page.drawText(
    `${input.monthLabel} · Generated ${format(new Date(input.generatedAtIso), "yyyy-MM-dd HH:mm:ss")}`,
    {
      x: 28,
      y: 1118,
      size: 9,
      font,
      color: rgb(0.86, 0.86, 0.89)
    }
  );

  page.drawText("Summary", { x: 28, y: 1086, size: 12, font: bold, color: rgb(0.1, 0.1, 0.1) });
  let summaryY = 1068;
  input.summaryRows.slice(0, 15).forEach(([label, amount]) => {
    page.drawText(label, { x: 28, y: summaryY, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(money(amount), {
      x: 270,
      y: summaryY,
      size: 9,
      font: bold,
      color: rgb(0.2, 0.2, 0.2)
    });
    summaryY -= 13;
  });

  page.drawText("Payment Breakdown", {
    x: 430,
    y: 1086,
    size: 12,
    font: bold,
    color: rgb(0.1, 0.1, 0.1)
  });
  let paymentY = 1068;
  input.paymentRows.slice(0, 8).forEach((row) => {
    page.drawText(row.name, { x: 430, y: paymentY, size: 9, font });
    page.drawText(money(row.amount), { x: 540, y: paymentY, size: 9, font: bold });
    page.drawText(`${row.percent.toFixed(2)}%`, { x: 660, y: paymentY, size: 9, font });
    paymentY -= 13;
  });

  page.drawText("Tax Breakdown", {
    x: 430,
    y: 960,
    size: 12,
    font: bold,
    color: rgb(0.1, 0.1, 0.1)
  });
  let taxY = 942;
  input.taxRows.forEach(([label, value]) => {
    page.drawText(label, { x: 430, y: taxY, size: 9, font });
    page.drawText(money(value), { x: 640, y: taxY, size: 9, font: bold });
    taxY -= 13;
  });

  drawPieChart(
    page,
    {
      x: 40,
      y: 640,
      radius: 72,
      title: "Revenue Category Share",
      slices: input.charts.revenueCategories
    },
    font,
    bold
  );

  drawPieChart(
    page,
    {
      x: 332,
      y: 640,
      radius: 72,
      title: "Payment Method Share",
      slices: input.charts.paymentMethods
    },
    font,
    bold
  );

  drawTopLotteryBars(
    page,
    {
      x: 602,
      y: 640,
      width: 210,
      height: 130,
      rows: input.charts.topLotteryTickets
    },
    font,
    bold
  );

  page.drawText("Notes", {
    x: 28,
    y: 584,
    size: 12,
    font: bold,
    color: rgb(0.1, 0.1, 0.1)
  });
  page.drawText((input.note || "No monthly notes.").slice(0, 600), {
    x: 28,
    y: 566,
    size: 9,
    lineHeight: 12,
    maxWidth: 786,
    font,
    color: rgb(0.25, 0.25, 0.25)
  });

  const page2 = pdf.addPage([842, 1191]);
  page2.drawText(`${input.store.store_name} · Lottery Breakdown`, {
    x: 28,
    y: 1152,
    size: 15,
    font: bold,
    color: rgb(0.12, 0.12, 0.12)
  });
  page2.drawText(`${input.monthLabel}`, {
    x: 28,
    y: 1136,
    size: 9,
    font,
    color: rgb(0.3, 0.3, 0.3)
  });

  const lotteryHeaders = ["#", "Lottery", "Tickets", "Sales", "Payouts", "Net"];
  const lotteryHeaderX = [28, 58, 300, 390, 500, 610];
  lotteryHeaders.forEach((header, index) => {
    page2.drawText(header, {
      x: lotteryHeaderX[index],
      y: 1112,
      size: 9,
      font: bold,
      color: rgb(0.15, 0.15, 0.15)
    });
  });

  let lotteryY = 1096;
  input.lotteryRows.slice(0, 30).forEach((row) => {
    page2.drawText(String(row.display_number), { x: 28, y: lotteryY, size: 8, font });
    page2.drawText(row.lottery_name.slice(0, 26), { x: 58, y: lotteryY, size: 8, font });
    page2.drawText(String(row.total_tickets_sold), { x: 300, y: lotteryY, size: 8, font });
    page2.drawText(money(row.total_scratch_sales), { x: 390, y: lotteryY, size: 8, font });
    page2.drawText(money(row.total_scratch_payouts), { x: 500, y: lotteryY, size: 8, font });
    page2.drawText(money(row.total_scratch_net), { x: 610, y: lotteryY, size: 8, font });
    lotteryY -= 11;
  });

  page2.drawText("Daily Performance", {
    x: 28,
    y: 736,
    size: 12,
    font: bold,
    color: rgb(0.12, 0.12, 0.12)
  });

  const dailyHeaders = [
    "Date",
    "Status",
    "Gross",
    "True Rev",
    "Lottery",
    "Billpay",
    "Tax",
    "Tickets"
  ];
  const dailyX = [28, 108, 182, 266, 350, 434, 526, 590];
  dailyHeaders.forEach((header, index) => {
    page2.drawText(header, {
      x: dailyX[index],
      y: 716,
      size: 8,
      font: bold,
      color: rgb(0.15, 0.15, 0.15)
    });
  });

  let dailyY = 702;
  input.dailyRows.slice(0, 34).forEach((row) => {
    page2.drawText(row.date, { x: 28, y: dailyY, size: 7, font });
    page2.drawText(row.status, { x: 108, y: dailyY, size: 7, font });
    page2.drawText(money(row.gross_collected), { x: 182, y: dailyY, size: 7, font });
    page2.drawText(money(row.true_revenue), { x: 266, y: dailyY, size: 7, font });
    page2.drawText(money(row.lottery_sales), { x: 350, y: dailyY, size: 7, font });
    page2.drawText(money(row.billpay_collected), { x: 434, y: dailyY, size: 7, font });
    page2.drawText(money(row.tax_amount), { x: 526, y: dailyY, size: 7, font });
    page2.drawText(String(row.tickets_sold_total), { x: 590, y: dailyY, size: 7, font });
    dailyY -= 11;
  });

  return pdf.save();
};
