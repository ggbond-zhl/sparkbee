CREATE TYPE "public"."charging_point_protocol" AS ENUM('OCPP16J');--> statement-breakpoint
CREATE TYPE "public"."connector_format" AS ENUM('socket', 'cable', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."connector_power_type" AS ENUM('ac', 'dc', 'unknown');--> statement-breakpoint
CREATE TABLE "charging_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity" text NOT NULL,
	"protocol" charging_point_protocol NOT NULL,
	"central_system_url" text NOT NULL,
	"vendor" text NOT NULL,
	"model" text NOT NULL,
	"firmware_version" text,
	"serial_number" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"charging_point_id" uuid NOT NULL,
	"evse_id" integer NOT NULL,
	"connector_id" integer NOT NULL,
	"type" text NOT NULL,
	"format" "connector_format" NOT NULL,
	"power_type" "connector_power_type" NOT NULL,
	"max_voltage" integer,
	"max_current" integer,
	"max_power" integer,
	"sort_order" integer NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_charging_point_id_charging_points_id_fk" FOREIGN KEY ("charging_point_id") REFERENCES "public"."charging_points"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "charging_points_active_created_at_idx" ON "charging_points" USING btree ("created_at") WHERE "charging_points"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "charging_points_deleted_at_created_at_idx" ON "charging_points" USING btree ("deleted_at","created_at");--> statement-breakpoint
CREATE INDEX "connectors_charging_point_idx" ON "connectors" USING btree ("charging_point_id");--> statement-breakpoint
CREATE INDEX "connectors_active_order_idx" ON "connectors" USING btree ("charging_point_id","sort_order","created_at") WHERE "connectors"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "connectors_active_evse_id_unique" ON "connectors" USING btree ("charging_point_id","evse_id") WHERE "connectors"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "connectors_active_connector_id_unique" ON "connectors" USING btree ("charging_point_id","connector_id") WHERE "connectors"."deleted_at" is null;