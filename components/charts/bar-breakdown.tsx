"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/utils";

interface BarDatum {
  name: string;
  value: number;
  color?: string;
}

export const BarBreakdown = ({
  data,
  title,
  currency = false
}: {
  data: BarDatum[];
  title: string;
  currency?: boolean;
}) => (
  <div className="h-72 w-full">
    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">{title}</p>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <XAxis dataKey="name" stroke="rgba(255,255,255,0.6)" fontSize={10} />
        <YAxis
          stroke="rgba(255,255,255,0.6)"
          fontSize={10}
          tickFormatter={(value: number) =>
            currency ? formatCurrency(Number(value)) : String(Number(value))
          }
        />
        <Tooltip
          formatter={(value: number) =>
            currency ? formatCurrency(Number(value)) : String(Number(value))
          }
          contentStyle={{
            background: "#111217",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8
          }}
        />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#ff4f2e" />
      </BarChart>
    </ResponsiveContainer>
  </div>
);
