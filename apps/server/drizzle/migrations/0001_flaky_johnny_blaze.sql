ALTER TABLE "charging_points" ADD COLUMN IF NOT EXISTS "name" text;--> statement-breakpoint
ALTER TABLE "charging_points" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
UPDATE "charging_points" SET "name" = "identity" WHERE "name" IS NULL;--> statement-breakpoint
ALTER TABLE "charging_points" ALTER COLUMN "name" SET NOT NULL;
