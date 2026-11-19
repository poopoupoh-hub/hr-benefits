import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** รวม className แบบ shadcn/ui (clsx + tailwind-merge) */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
