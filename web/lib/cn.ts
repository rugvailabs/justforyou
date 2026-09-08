/**
 * Merge class names, letting a caller's class win over a component default.
 *
 * clsx flattens the conditional forms; tailwind-merge resolves the conflicts
 * that flattening leaves behind - without it, `cn("px-4", "px-2")` emits both
 * and the winner depends on stylesheet order rather than on the caller.
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
