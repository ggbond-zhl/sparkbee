CREATE TABLE "transaction_delivery_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"charging_point_id" uuid NOT NULL,
	"transaction_record_id" uuid NOT NULL,
	"delivery_sequence" bigint NOT NULL,
	"message_id" uuid NOT NULL,
	"message_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"in_flight_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_delivery_sequences" (
	"charging_point_id" uuid PRIMARY KEY NOT NULL,
	"next_sequence" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transaction_delivery_messages" ADD CONSTRAINT "transaction_delivery_messages_charging_point_id_charging_points_id_fk" FOREIGN KEY ("charging_point_id") REFERENCES "public"."charging_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_delivery_messages" ADD CONSTRAINT "transaction_delivery_messages_transaction_record_id_charging_transactions_id_fk" FOREIGN KEY ("transaction_record_id") REFERENCES "public"."charging_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_delivery_sequences" ADD CONSTRAINT "transaction_delivery_sequences_charging_point_id_charging_points_id_fk" FOREIGN KEY ("charging_point_id") REFERENCES "public"."charging_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_delivery_point_sequence_unique" ON "transaction_delivery_messages" USING btree ("charging_point_id","delivery_sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_delivery_message_id_unique" ON "transaction_delivery_messages" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "transaction_delivery_point_status_sequence_idx" ON "transaction_delivery_messages" USING btree ("charging_point_id","status","delivery_sequence");--> statement-breakpoint
CREATE INDEX "transaction_delivery_retry_idx" ON "transaction_delivery_messages" USING btree ("charging_point_id","next_attempt_at","delivery_sequence");--> statement-breakpoint
CREATE INDEX "transaction_delivery_terminal_idx" ON "transaction_delivery_messages" USING btree ("status","delivered_at","failed_at");--> statement-breakpoint
ALTER TABLE "transaction_delivery_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transaction_delivery_sequences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
		REVOKE ALL ON TABLE "transaction_delivery_messages" FROM anon;
		REVOKE ALL ON TABLE "transaction_delivery_sequences" FROM anon;
	END IF;
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
		REVOKE ALL ON TABLE "transaction_delivery_messages" FROM authenticated;
		REVOKE ALL ON TABLE "transaction_delivery_sequences" FROM authenticated;
	END IF;
END
$$;
