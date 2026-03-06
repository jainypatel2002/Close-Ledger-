"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { formatCurrency } from "@/lib/utils";

interface PieDatum {
  name: string;
  value: number;
  color: string;
}

export const PieBreakdown = ({
  data,
  title
}: {
  data: PieDatum[];
  title: string;
}) => (
  <div className="h-72 w-full">
    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">{title}</p>
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="45%"
          innerRadius={50}
          outerRadius={90}
          stroke="rgba(255,255,255,0.08)"
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => formatCurrency(value)}
          contentStyle={{
            background: "#111217",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8
          }}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  </div>
);
