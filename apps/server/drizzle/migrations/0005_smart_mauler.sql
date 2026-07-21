CREATE TABLE "protocol_events" (
	"id" text PRIMARY KEY NOT NULL,
	"sequence" integer NOT NULL,
	"charging_point_id" uuid NOT NULL,
	"protocol" charging_point_protocol NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"event_type" text NOT NULL,
	"resource" jsonb NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protocol_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"sequence" integer NOT NULL,
	"charging_point_id" uuid NOT NULL,
	"protocol" charging_point_protocol NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"direction" text NOT NULL,
	"action" text,
	"message_id" text,
	"body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "protocol_events" ADD CONSTRAINT "protocol_events_charging_point_id_charging_points_id_fk" FOREIGN KEY ("charging_point_id") REFERENCES "public"."charging_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocol_messages" ADD CONSTRAINT "protocol_messages_charging_point_id_charging_points_id_fk" FOREIGN KEY ("charging_point_id") REFERENCES "public"."charging_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "protocol_events_point_occurred_at_idx" ON "protocol_events" USING btree ("charging_point_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "protocol_events_point_type_occurred_at_idx" ON "protocol_events" USING btree ("charging_point_id","event_type","occurred_at","id");--> statement-breakpoint
CREATE INDEX "protocol_events_occurred_at_idx" ON "protocol_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "protocol_messages_point_occurred_at_idx" ON "protocol_messages" USING btree ("charging_point_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "protocol_messages_point_direction_occurred_at_idx" ON "protocol_messages" USING btree ("charging_point_id","direction","occurred_at","id");--> statement-breakpoint
CREATE INDEX "protocol_messages_point_action_occurred_at_idx" ON "protocol_messages" USING btree ("charging_point_id","action","occurred_at","id");--> statement-breakpoint
CREATE INDEX "protocol_messages_occurred_at_idx" ON "protocol_messages" USING btree ("occurred_at");--> statement-breakpoint
ALTER TABLE "protocol_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "protocol_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
		REVOKE ALL ON TABLE "protocol_events" FROM anon;
		REVOKE ALL ON TABLE "protocol_messages" FROM anon;
	END IF;
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
		REVOKE ALL ON TABLE "protocol_events" FROM authenticated;
		REVOKE ALL ON TABLE "protocol_messages" FROM authenticated;
	END IF;
END
$$;
