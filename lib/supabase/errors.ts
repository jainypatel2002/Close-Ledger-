interface SupabasePostgrestErrorLike {
  code?: unknown;
  message?: unknown;
  hint?: unknown;
  details?: unknown;
}

const TABLE_MISSING_CODE = "PGRST205";
const COLUMN_MISSING_CODES = new Set(["PGRST204", "42703"]);
const UNIQUE_VIOLATION_CODE = "23505";

const getSupabaseErrorText = (error: SupabasePostgrestErrorLike) =>
  [error.message, error.hint, error.details]
    .map((value) => String(value ?? ""))
    .join("\n");

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

  const combined = getSupabaseErrorText(postgrestError);
  const fullyQualified = tableName.includes(".") ? tableName : `public.${tableName}`;

  return (
    combined.includes(tableName) ||
    combined.includes(fullyQualified)
  );
};

export const isSupabaseMissingColumnError = (
  error: unknown,
  tableName?: string,
  columnName?: string
): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const postgrestError = error as SupabasePostgrestErrorLike;
  if (!COLUMN_MISSING_CODES.has(String(postgrestError.code ?? ""))) {
    return false;
  }

  const combined = getSupabaseErrorText(postgrestError);
  const fullyQualified = tableName
    ? tableName.includes(".")
      ? tableName
      : `public.${tableName}`
    : null;

  if (tableName && !combined.includes(tableName) && !(fullyQualified && combined.includes(fullyQualified))) {
    return false;
  }

  if (!columnName) {
    return combined.toLowerCase().includes("column");
  }

  return (
    combined.includes(columnName) ||
    combined.includes(`'${columnName}'`) ||
    combined.includes(`"${columnName}"`)
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
