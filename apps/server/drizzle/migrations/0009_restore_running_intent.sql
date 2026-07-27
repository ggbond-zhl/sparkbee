CREATE TYPE "public"."charging_point_running_intent" AS ENUM('stopped', 'running');--> statement-breakpoint
ALTER TABLE "charging_points" ADD COLUMN "running_intent" charging_point_running_intent DEFAULT 'stopped' NOT NULL;--> statement-breakpoint
UPDATE "charging_points" AS "charging_point"
SET "running_intent" = 'running'
WHERE EXISTS (
	SELECT 1
	FROM "charging_transactions" AS "transaction"
	WHERE "transaction"."charging_point_id" = "charging_point"."id"
		AND "transaction"."ended_at" IS NULL
);
