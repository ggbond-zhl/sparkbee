CREATE TABLE "protocol_configurations" (
	"charging_point_id" uuid NOT NULL,
	"protocol" charging_point_protocol NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"pending_restart" boolean DEFAULT false NOT NULL,
	"last_modified_by" text DEFAULT 'initialization' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "protocol_configurations_point_protocol_key_pk" PRIMARY KEY("charging_point_id","protocol","key")
);
--> statement-breakpoint
ALTER TABLE "protocol_configurations" ADD CONSTRAINT "protocol_configurations_charging_point_id_charging_points_id_fk" FOREIGN KEY ("charging_point_id") REFERENCES "public"."charging_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "protocol_configurations_point_protocol_idx" ON "protocol_configurations" USING btree ("charging_point_id","protocol");