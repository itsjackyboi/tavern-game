export interface ValidateOptions {
  allowedBuilds?: string[];
  maxSimMs?: number;
  minMonopolyMs?: number;
  minSponsorMs?: number;
}
export function lcValidateRecord(r: unknown, opts?: ValidateOptions): string | null;
export function lcSanitizeCell(v: unknown): string;
export const LC_CITIES: string[];
export const LC_CATEGORIES: string[];
