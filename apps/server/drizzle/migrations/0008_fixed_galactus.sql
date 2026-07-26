CREATE TABLE "authorization_cache_entries" (
	"charging_point_id" uuid NOT NULL,
	"protocol" charging_point_protocol NOT NULL,
	"credential_id" text NOT NULL,
	"evse_id" integer NOT NULL,
	"status" text NOT NULL,
	"valid_until" timestamp with time zone,
	"group_credential_id" text,
	"last_evaluated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authorization_cache_entries_point_protocol_credential_evse_pk" PRIMARY KEY("charging_point_id","protocol","credential_id","evse_id")
);
--> statement-breakpoint
CREATE TABLE "local_authorization_entries" (
	"charging_point_id" uuid NOT NULL,
	"protocol" charging_point_protocol NOT NULL,
	"credential_id" text NOT NULL,
	"status" text NOT NULL,
	"valid_until" timestamp with time zone,
	"group_credential_id" text,
	CONSTRAINT "local_authorization_entries_point_protocol_credential_pk" PRIMARY KEY("charging_point_id","protocol","credential_id")
);
--> statement-breakpoint
CREATE TABLE "local_authorization_lists" (
	"charging_point_id" uuid NOT NULL,
	"protocol" charging_point_protocol NOT NULL,
	"version" integer NOT NULL,
	"source" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "local_authorization_lists_point_protocol_pk" PRIMARY KEY("charging_point_id","protocol")
);
--> statement-breakpoint
ALTER TABLE "authorization_cache_entries" ADD CONSTRAINT "authorization_cache_entries_charging_point_id_charging_points_id_fk" FOREIGN KEY ("charging_point_id") REFERENCES "public"."charging_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_authorization_entries" ADD CONSTRAINT "local_authorization_entries_charging_point_id_charging_points_id_fk" FOREIGN KEY ("charging_point_id") REFERENCES "public"."charging_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_authorization_lists" ADD CONSTRAINT "local_authorization_lists_charging_point_id_charging_points_id_fk" FOREIGN KEY ("charging_point_id") REFERENCES "public"."charging_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "authorization_cache_entries_point_protocol_idx" ON "authorization_cache_entries" USING btree ("charging_point_id","protocol");--> statement-breakpoint
ALTER TABLE "authorization_cache_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "local_authorization_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "local_authorization_lists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
		REVOKE ALL ON TABLE "authorization_cache_entries" FROM anon;
		REVOKE ALL ON TABLE "local_authorization_entries" FROM anon;
		REVOKE ALL ON TABLE "local_authorization_lists" FROM anon;
	END IF;
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
		REVOKE ALL ON TABLE "authorization_cache_entries" FROM authenticated;
		REVOKE ALL ON TABLE "local_authorization_entries" FROM authenticated;
		REVOKE ALL ON TABLE "local_authorization_lists" FROM authenticated;
	END IF;
END
$$;
