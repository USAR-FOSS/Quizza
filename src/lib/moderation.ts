/**
 * A small, deliberately minimal profanity screen for publicly displayed text
 * (nicknames and word-cloud entries). It catches obvious slurs and insults, not
 * every variant. It is a first line, not a complete moderation system.
 */
const BLOCKED = [
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "nigger",
  "nigga",
  "faggot",
  "retard",
  "asshole",
  "dick",
  "whore",
  "slut",
  "rape",
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    // map common leet substitutions before stripping, so sh1t -> shit
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/@/g, "a")
    .replace(/[^a-z]/g, ""); // drop spacing/punctuation so f.u.c.k is caught
}

export function isClean(text: string): boolean {
  const n = normalize(text);
  return !BLOCKED.some((w) => n.includes(w));
}
