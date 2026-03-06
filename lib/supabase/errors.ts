interface SupabasePostgrestErrorLike {
  code?: unknown;
  message?: unknown;
  hint?: unknown;
}

const TABLE_MISSING_CODE = "PGRST205";

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
