export function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production")
    throw new Error("AUTH_SECRET must be configured in production.");
  return "dev-insecure-secret-change-me";
}
