import {
  createSupabaseUserDb,
  supabaseAdmin,
  supabaseServerDb,
} from "./supabase";

const appSchemaDb = supabaseServerDb.schema("app");
const adminAppSchemaDb = supabaseAdmin.schema("app");

function getErrorField(error: unknown, field: "message" | "details") {
  if (!error || typeof error !== "object" || !(field in error)) return "";
  const value = error[field as keyof typeof error];
  return typeof value === "string" ? value : "";
}

function isInvalidAppSchemaError(error: unknown) {
  const message = getErrorField(error, "message");
  const details = getErrorField(error, "details");
  const combined = `${message} ${details}`.toLowerCase();
  return combined.includes("invalid schema") && combined.includes("app");
}

/**
 * Default app DB accessor (schema switching). Uses the caller's Supabase
 * access token when available so PostgREST evaluates RLS policies instead of
 * bypassing them with the service-role key.
 */
export const appDbForAccessToken = (accessToken: string) =>
  createSupabaseUserDb(accessToken).schema("app");

export const appDb = (accessToken?: string) =>
  accessToken ? appDbForAccessToken(accessToken) : appSchemaDb;

/** Elevated app DB accessor for tightly-scoped administrative operations only. */
export const adminAppDb = () => adminAppSchemaDb;

/**
 * Runs a query against schema `app` first, then retries using fully-qualified
 * table names when a deployment does not allow schema switching.
 */
type QueryResult<TData = unknown, TError = unknown> = {
  data: TData;
  error: TError;
};

export async function queryAppTable<TData = unknown, TError = unknown>(
  run: (from: (name: string) => unknown) => Promise<QueryResult<TData, TError>>
): Promise<QueryResult<TData, TError>> {
  let primary: QueryResult<TData | null, TError | unknown> | null = null;
  try {
    primary = await run((name: string) => appSchemaDb.from(name));
  } catch (error: unknown) {
    if (!isInvalidAppSchemaError(error)) throw error;
    primary = { data: null, error };
  }

  if (!primary.error || !isInvalidAppSchemaError(primary.error))
    return primary as QueryResult<TData, TError>;

  // Fallback for deployments where schema `app` is not exposed to PostgREST.
  // Retry first on default schema, then via fully-qualified table name.
  const defaultSchemaResult = await run((name: string) =>
    supabaseServerDb.from(name)
  );
  if (!defaultSchemaResult.error) return defaultSchemaResult;

  return run((name: string) => supabaseServerDb.from(`app.${name}`));
}

export function getSupabaseUserIdFromUnionId(unionId: string): string | null {
  if (!unionId.startsWith("supabase:")) return null;
  return unionId.slice("supabase:".length) || null;
}
