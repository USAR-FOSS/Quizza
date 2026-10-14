ALTER TABLE "participants" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "device_id" text;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "participants_session_user_key" ON "participants" USING btree ("session_id","user_id") WHERE "participants"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "participants_session_device_key" ON "participants" USING btree ("session_id","device_id") WHERE "participants"."device_id" is not null;