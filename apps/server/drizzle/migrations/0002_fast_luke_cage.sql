CREATE TABLE "runtime_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"sequence" integer NOT NULL,
	"charging_point_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"level" text NOT NULL,
	"code" text,
	"message" text NOT NULL,
	"context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runtime_logs" ADD CONSTRAINT "runtime_logs_charging_point_id_charging_points_id_fk" FOREIGN KEY ("charging_point_id") REFERENCES "public"."charging_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "runtime_logs_charging_point_occurred_at_idx" ON "runtime_logs" USING btree ("charging_point_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "runtime_logs_occurred_at_idx" ON "runtime_logs" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "runtime_logs_code_idx" ON "runtime_logs" USING btree ("charging_point_id","code");--> statement-breakpoint
CREATE INDEX "runtime_logs_operation_id_idx" ON "runtime_logs" USING btree ("charging_point_id",("context" ->> 'operationId'));
--> statement-breakpoint
ALTER TABLE "runtime_logs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
		REVOKE ALL ON TABLE "runtime_logs" FROM anon;
	END IF;
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
		REVOKE ALL ON TABLE "runtime_logs" FROM authenticated;
	END IF;
END
$$;
