import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const toMoney = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number.parseFloat(value.toFixed(2));
};

export const formatCurrency = (value: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    Number.isFinite(value) ? value : 0
  );

export const formatDateTime = (value: string | Date) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(typeof value === "string" ? new Date(value) : value);

export const formatDate = (value: string | Date) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium"
  }).format(typeof value === "string" ? new Date(value) : value);

export const noop = () => undefined;
