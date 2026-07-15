ALTER TABLE "runtime_logs" RENAME TO "actor_logs";
--> statement-breakpoint
DO $$
DECLARE
	constraint_row record;
BEGIN
	FOR constraint_row IN
		SELECT conname
		FROM pg_constraint
		WHERE conrelid = 'actor_logs'::regclass
			AND conname LIKE 'runtime_logs_%'
	LOOP
		EXECUTE format(
			'ALTER TABLE actor_logs RENAME CONSTRAINT %I TO %I',
			constraint_row.conname,
			replace(constraint_row.conname, 'runtime_logs_', 'actor_logs_')
		);
	END LOOP;
END
$$;
--> statement-breakpoint
ALTER INDEX "runtime_logs_charging_point_occurred_at_idx" RENAME TO "actor_logs_charging_point_occurred_at_idx";
--> statement-breakpoint
ALTER INDEX "runtime_logs_occurred_at_idx" RENAME TO "actor_logs_occurred_at_idx";
--> statement-breakpoint
ALTER INDEX "runtime_logs_code_idx" RENAME TO "actor_logs_code_idx";
--> statement-breakpoint
ALTER INDEX "runtime_logs_operation_id_idx" RENAME TO "actor_logs_operation_id_idx";
