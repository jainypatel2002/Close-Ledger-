import { describe, expect, it } from "vitest";
import {
  getSupabaseConstraintName,
  isSupabaseMissingTableError,
  isSupabaseUniqueViolation
} from "@/lib/supabase/errors";

describe("supabase error helpers", () => {
  it("detects missing-table postgrest errors by code + table name", () => {
    const error = {
      code: "PGRST205",
      message: "Could not find the table 'public.lottery_master_entries' in the schema cache",
      hint: "Perhaps you meant the table 'public.lottery_scratch_lines'"
    };

    expect(isSupabaseMissingTableError(error, "lottery_master_entries")).toBe(true);
  });

  it("returns false for non-matching table names", () => {
    const error = {
      code: "PGRST205",
      message: "Could not find the table 'public.some_other_table' in the schema cache",
      hint: null
    };

    expect(isSupabaseMissingTableError(error, "lottery_master_entries")).toBe(false);
  });

  it("returns false for unrelated errors", () => {
    const error = {
      code: "23505",
      message: "duplicate key value violates unique constraint",
      hint: null
    };

    expect(isSupabaseMissingTableError(error, "lottery_master_entries")).toBe(false);
  });

  it("detects unique violation code", () => {
    expect(
      isSupabaseUniqueViolation({
        code: "23505",
        message: "duplicate key value violates unique constraint"
      })
    ).toBe(true);
  });

  it("extracts constraint names when present", () => {
    const constraint = getSupabaseConstraintName({
      code: "23505",
      message:
        'duplicate key value violates unique constraint "idx_lottery_master_store_display_active_unique"'
    });
    expect(constraint).toBe("idx_lottery_master_store_display_active_unique");
  });
});
