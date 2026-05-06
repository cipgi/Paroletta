const HTML_TAG_PATTERN = /<[^>]*>/g;
const HTML_DELIMITER_PATTERN = /[<>]/g;
const WHITESPACE_PATTERN = /\s+/g;

export const MAX_PROFILE_NAME_LENGTH = 255;

function removeControlCharacters(input: string): string {
  return Array.from(input)
    .filter(character => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 31 && (codePoint < 127 || codePoint > 159);
    })
    .join("");
}

export function sanitizePlainText(input: string): string {
  return removeControlCharacters(input)
    .normalize("NFC")
    .replace(HTML_TAG_PATTERN, "")
    .replace(HTML_DELIMITER_PATTERN, "")
    .replace(WHITESPACE_PATTERN, " ")
    .trim();
}

export function sanitizeProfileName(input: string): string {
  return sanitizePlainText(input).slice(0, MAX_PROFILE_NAME_LENGTH);
}

export function sanitizeProfileNameOrFallback(
  input: string | null | undefined,
  fallback: string
): string {
  const sanitized = sanitizeProfileName(input ?? "");
  if (sanitized) return sanitized;

  const sanitizedFallback = sanitizeProfileName(fallback);
  return sanitizedFallback || "Utente";
}
