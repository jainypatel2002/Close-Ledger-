interface SupabasePostgrestErrorLike {
  code?: unknown;
  message?: unknown;
  hint?: unknown;
  details?: unknown;
}

const TABLE_MISSING_CODE = "PGRST205";
const UNIQUE_VIOLATION_CODE = "23505";

export const isSupabaseMissingTableError = (
  error: unknown,
  tableName?: string
): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const postgrestError = error as SupabasePostgrestErrorLike;
  if (postgrestError.code !== TABLE_MISSING_CODE) {
    return false;
  }

  if (!tableName) {
    return true;
  }

  const message = String(postgrestError.message ?? "");
  const hint = String(postgrestError.hint ?? "");
  const fullyQualified = tableName.includes(".") ? tableName : `public.${tableName}`;

  return (
    message.includes(tableName) ||
    message.includes(fullyQualified) ||
    hint.includes(tableName) ||
    hint.includes(fullyQualified)
  );
};

export const isSupabaseUniqueViolation = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const postgrestError = error as SupabasePostgrestErrorLike;
  return String(postgrestError.code ?? "") === UNIQUE_VIOLATION_CODE;
};

export const getSupabaseConstraintName = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return null;
  }

  const postgrestError = error as SupabasePostgrestErrorLike;
  const message = String(postgrestError.message ?? "");
  const details = String(postgrestError.details ?? "");
  const combined = `${message}\n${details}`;
  const match = combined.match(/constraint\s+"([^"]+)"/i);
  return match?.[1] ?? null;
};
