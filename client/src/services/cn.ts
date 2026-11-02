import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
// Joins conditional class names and resolves conflicting Tailwind utilities,
// so a later class overrides an earlier one.
export function cn(...values: ClassValue[]) {
  return twMerge(clsx(values));
}
