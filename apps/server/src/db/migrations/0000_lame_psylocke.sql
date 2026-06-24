CREATE TYPE "public"."station_desired_status" AS ENUM('running', 'stopped');--> statement-breakpoint
CREATE TYPE "public"."station_runtime_status" AS ENUM('starting', 'running', 'stopped');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('active', 'ended', 'failed', 'rejected');--> statement-breakpoint
CREATE TABLE "connector_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"station_id" uuid NOT NULL,
	"connector_id" integer NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"plug_state" text DEFAULT 'unplugged' NOT NULL,
	"vehicle_presence" text DEFAULT 'absent' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"station_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"protocol_message" boolean DEFAULT false NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"protocol" text DEFAULT 'OCPP16J' NOT NULL,
	"csms_base_url" text NOT NULL,
	"identity" text NOT NULL,
	"vendor" text NOT NULL,
	"model" text NOT NULL,
	"connector_count" integer NOT NULL,
	"connector_max_power_w" integer NOT NULL,
	"desired_status" "station_desired_status" DEFAULT 'stopped' NOT NULL,
	"runtime_status" "station_runtime_status" DEFAULT 'stopped' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stations_identity_unique" UNIQUE("identity")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"station_id" uuid NOT NULL,
	"simulator_transaction_id" text NOT NULL,
	"connector_id" integer NOT NULL,
	"id_tag" text NOT NULL,
	"meter_start_wh" integer DEFAULT 0 NOT NULL,
	"meter_stop_wh" integer,
	"status" "transaction_status" DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stopped_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "connector_snapshots" ADD CONSTRAINT "connector_snapshots_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_logs" ADD CONSTRAINT "event_logs_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connector_snapshots_station_connector_idx" ON "connector_snapshots" USING btree ("station_id","connector_id");--> statement-breakpoint
CREATE INDEX "event_logs_station_occurred_at_idx" ON "event_logs" USING btree ("station_id","occurred_at");--> statement-breakpoint
CREATE INDEX "stations_identity_idx" ON "stations" USING btree ("identity");--> statement-breakpoint
CREATE INDEX "stations_desired_status_idx" ON "stations" USING btree ("desired_status");--> statement-breakpoint
CREATE INDEX "transactions_station_idx" ON "transactions" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "transactions_simulator_transaction_idx" ON "transactions" USING btree ("simulator_transaction_id");