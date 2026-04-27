CREATE TABLE IF NOT EXISTS "analytics_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"session_id" uuid,
	"event_ts" timestamp with time zone NOT NULL,
	"event" text NOT NULL,
	"params" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "free_spins_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trigger_scatter_count" smallint NOT NULL,
	"locked_bet" numeric(10, 2) NOT NULL,
	"bet_level_idx" smallint NOT NULL,
	"total_awarded" smallint DEFAULT 10 NOT NULL,
	"spins_remaining" smallint NOT NULL,
	"spins_completed" smallint DEFAULT 0 NOT NULL,
	"running_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"retrigger_count" smallint DEFAULT 0 NOT NULL,
	"longest_chain" smallint DEFAULT 0 NOT NULL,
	"max_multiplier" smallint DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "free_spins_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rtp_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"snapshot_at" timestamp with time zone DEFAULT now() NOT NULL,
	"window_hours" integer NOT NULL,
	"total_spins" integer NOT NULL,
	"total_wagered" numeric(16, 2) NOT NULL,
	"total_won" numeric(16, 2) NOT NULL,
	"rtp" numeric(6, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"platform" text,
	"screen_res" text,
	"balance" numeric(14, 2) DEFAULT '50000' NOT NULL,
	"bet_level_idx" smallint DEFAULT 3 NOT NULL,
	"quick_spin" boolean DEFAULT false NOT NULL,
	"total_spins" integer DEFAULT 0 NOT NULL,
	"total_wagered" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_won" numeric(14, 2) DEFAULT '0' NOT NULL,
	"biggest_win" numeric(14, 2) DEFAULT '0' NOT NULL,
	"restart_count" smallint DEFAULT 0 NOT NULL,
	"rng_s0" text DEFAULT '0' NOT NULL,
	"rng_s1" text DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "spin_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"spin_number" integer NOT NULL,
	"game_mode" text NOT NULL,
	"bet_level_idx" smallint NOT NULL,
	"total_bet" numeric(10, 2) NOT NULL,
	"spin_type" text NOT NULL,
	"rng_seed_state" text NOT NULL,
	"stops" jsonb NOT NULL,
	"grid_result" jsonb NOT NULL,
	"chain_steps" jsonb NOT NULL,
	"chain_length" smallint NOT NULL,
	"max_multiplier" smallint NOT NULL,
	"total_win" numeric(14, 2) NOT NULL,
	"scatter_win" numeric(14, 2) NOT NULL,
	"line_win" numeric(14, 2) NOT NULL,
	"features" jsonb NOT NULL,
	"balance_before" numeric(14, 2) NOT NULL,
	"balance_after" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "free_spins_sessions" ADD CONSTRAINT "free_spins_sessions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spin_log" ADD CONSTRAINT "spin_log_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_event_idx" ON "analytics_events" ("event");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_session_idx" ON "analytics_events" ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_ts_idx" ON "analytics_events" ("event_ts");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_last_seen_idx" ON "sessions" ("last_seen_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spin_log_session_idx" ON "spin_log" ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spin_log_created_at_idx" ON "spin_log" ("created_at");