DROP INDEX "answers_powerup_once";--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "powerup_target_id" uuid;--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "attack_stolen" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "attack_blocked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_powerup_target_id_participants_id_fk" FOREIGN KEY ("powerup_target_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "answers_participant_powerup_idx" ON "answers" USING btree ("participant_id","powerup");