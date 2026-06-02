import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMYR(amount: number | string) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(
    Number(amount)
  );
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("en-MY", { dateStyle: "medium" }).format(new Date(date));
}
