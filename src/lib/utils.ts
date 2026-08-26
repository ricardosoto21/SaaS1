import { clsx } from "clsx";
import { format } from "date-fns";

export function cn(...values: Array<string | false | null | undefined>) {
  return clsx(values);
}

export function formatCurrency(amount: number, locale = "es-CL", currency = "CLP") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string, locale = "es-CL") {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function formatDateTime(date: string, locale = "es-CL") {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function toLocalDatetimeInputValue(date: string) {
  return format(new Date(date), "yyyy-MM-dd'T'HH:mm");
}

export function clampNumber(value: number, min = 0) {
  return Number.isFinite(value) ? Math.max(min, value) : min;
}

export function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

