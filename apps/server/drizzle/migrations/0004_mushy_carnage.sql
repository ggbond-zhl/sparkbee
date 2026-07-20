CREATE TABLE "charging_samples" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_record_id" uuid NOT NULL,
	"sampled_at" timestamp with time zone NOT NULL,
	"meter_wh" double precision NOT NULL,
	"power_w" double precision NOT NULL,
	"current_a" double precision NOT NULL,
	"voltage_v" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charging_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"charging_point_id" uuid NOT NULL,
	"transaction_id" text NOT NULL,
	"ocpp_transaction_id" integer,
	"evse_id" integer NOT NULL,
	"connector_id" integer NOT NULL,
	"id_tag" text NOT NULL,
	"state" text NOT NULL,
	"charging_state" text NOT NULL,
	"meter_start_wh" double precision NOT NULL,
	"latest_meter_wh" double precision NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "charging_samples" ADD CONSTRAINT "charging_samples_transaction_record_id_charging_transactions_id_fk" FOREIGN KEY ("transaction_record_id") REFERENCES "public"."charging_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charging_transactions" ADD CONSTRAINT "charging_transactions_charging_point_id_charging_points_id_fk" FOREIGN KEY ("charging_point_id") REFERENCES "public"."charging_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "charging_samples_transaction_sampled_at_idx" ON "charging_samples" USING btree ("transaction_record_id","sampled_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "charging_samples_transaction_sampled_at_unique" ON "charging_samples" USING btree ("transaction_record_id","sampled_at");--> statement-breakpoint
CREATE INDEX "charging_samples_sampled_at_idx" ON "charging_samples" USING btree ("sampled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "charging_transactions_point_transaction_unique" ON "charging_transactions" USING btree ("charging_point_id","transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "charging_transactions_active_connector_unique" ON "charging_transactions" USING btree ("charging_point_id","evse_id","connector_id") WHERE "charging_transactions"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "charging_transactions_active_point_idx" ON "charging_transactions" USING btree ("charging_point_id","started_at") WHERE "charging_transactions"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "charging_transactions_ended_at_idx" ON "charging_transactions" USING btree ("ended_at");--> statement-breakpoint
ALTER TABLE "charging_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "charging_samples" ENABLE ROW LEVEL SECURITY;
