export type AdminCheckableUser = {
  id?: string;
  email?: string | null;
  name?: string | null;
  role?: string | null;
};

/**
 * Checks whether a given user possesses platform administrative privileges.
 * A user is recognized as an admin if:
 * 1. Their database user role is explicitly set to "admin", OR
 * 2. Their email address matches one of the comma-separated emails in the ADMIN_EMAILS environment variable.
 */
export function isUserAdmin(user: AdminCheckableUser | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (user.email && adminEmails.includes(user.email.toLowerCase())) {
    return true;
  }
  return false;
}
