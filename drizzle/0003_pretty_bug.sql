CREATE TABLE "question_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "powerup" text;--> statement-breakpoint
ALTER TABLE "question_views" ADD CONSTRAINT "question_views_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_views" ADD CONSTRAINT "question_views_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "question_views_once" ON "question_views" USING btree ("participant_id","question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "answers_powerup_once" ON "answers" USING btree ("participant_id","powerup");