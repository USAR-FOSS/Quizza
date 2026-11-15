#!/usr/bin/env node
/**
 * scripts/cleanup-orphaned-uploads.mjs
 *
 * Maintenance utility for Quizza self-hosting deployments.
 * Scans Postgres for unreferenced upload assets (such as replaced draft avatars,
 * abandoned media uploads, or participants from past ended sessions) and purges
 * them to reclaim database storage space.
 *
 * Usage:
 *   node scripts/cleanup-orphaned-uploads.mjs [--dry-run]
 */

import { neon, neonConfig } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Error: DATABASE_URL environment variable is required.");
  process.exit(1);
}

const isDryRun = process.argv.includes("--dry-run");

async function run() {
  console.log(`[quizza-cleanup] Starting upload maintenance (mode: ${isDryRun ? "DRY RUN" : "LIVE PURGE"})...`);
  const sql = neon(databaseUrl);

  // 1. Fetch all candidate uploads
  const candidates = await sql`
    SELECT id, content_type, length(data) as bytes, created_at, quiz_id, participant_id
    FROM uploads
    WHERE created_at < NOW() - INTERVAL '24 hours'
  `;

  console.log(`[quizza-cleanup] Evaluating ${candidates.length} upload(s) older than 24 hours...`);

  let orphanedCount = 0;
  let reclaimedBytes = 0;
  const orphanedIds = [];

  for (const asset of candidates) {
    const id = asset.id;

    // Check references in questions.media_url
    const [qRef] = await sql`
      SELECT id FROM questions WHERE media_url LIKE ${'%' + id + '%'} LIMIT 1
    `;
    if (qRef) continue;

    // Check references in participants.avatar_url
    const [pRef] = await sql`
      SELECT id FROM participants WHERE avatar_url LIKE ${'%' + id + '%'} LIMIT 1
    `;
    if (pRef) continue;

    // Check references in quizzes settings (coverImage / iconImage)
    const [quizRef] = await sql`
      SELECT id FROM quizzes
      WHERE (settings->>'coverImage' LIKE ${'%' + id + '%'} OR settings->>'iconImage' LIKE ${'%' + id + '%'})
      LIMIT 1
    `;
    if (quizRef) continue;

    // Asset is unreferenced
    orphanedCount++;
    reclaimedBytes += Number(asset.bytes || 0);
    orphanedIds.push(id);
  }

  const mb = (reclaimedBytes / (1024 * 1024)).toFixed(2);
  console.log(`[quizza-cleanup] Found ${orphanedCount} orphaned asset(s) totaling ~${mb} MB.`);

  if (orphanedIds.length > 0) {
    if (isDryRun) {
      console.log(`[quizza-cleanup] Dry run complete. No records were deleted.`);
    } else {
      // Chunked deletion
      const chunkSize = 100;
      for (let i = 0; i < orphanedIds.length; i += chunkSize) {
        const slice = orphanedIds.slice(i, i + chunkSize);
        await sql`
          DELETE FROM uploads WHERE id = ANY(${slice})
        `;
      }
      console.log(`[quizza-cleanup] Successfully purged ${orphanedCount} orphaned upload(s), freed ~${mb} MB.`);
    }
  } else {
    console.log(`[quizza-cleanup] Database is clean. No orphaned uploads detected.`);
  }
}

run().catch((err) => {
  console.error("[quizza-cleanup] Maintenance failed:", err);
  process.exit(1);
});
