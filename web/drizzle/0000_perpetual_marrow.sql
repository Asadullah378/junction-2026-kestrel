CREATE TABLE "conversations" (
	"user_id" uuid NOT NULL,
	"id" text NOT NULL,
	"title" text NOT NULL,
	"origin" text NOT NULL,
	"model_label" text,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"notify_when_done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "conversations_origin_check" CHECK ("conversations"."origin" in ('web', 'desktop'))
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"trigger" text DEFAULT 'schedule' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"output" text,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"emailed_at" timestamp with time zone,
	CONSTRAINT "job_runs_trigger_check" CHECK ("job_runs"."trigger" in ('schedule', 'manual')),
	CONSTRAINT "job_runs_status_check" CHECK ("job_runs"."status" in ('running', 'done', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"prompt" text NOT NULL,
	"schedule" jsonb NOT NULL,
	"schedule_text" text NOT NULL,
	"time_zone" text NOT NULL,
	"until_at" timestamp with time zone,
	"max_runs" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"mode" text NOT NULL,
	"effort" integer DEFAULT 1 NOT NULL,
	"place" text,
	"country" text,
	"coords" jsonb,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"run_count" integer DEFAULT 0 NOT NULL,
	"conversation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_status_check" CHECK ("jobs"."status" in ('active', 'paused', 'done')),
	CONSTRAINT "jobs_max_runs_check" CHECK ("jobs"."max_runs" is null or "jobs"."max_runs" > 0)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"conversation_id" text,
	"job_id" uuid,
	"run_id" uuid,
	"dedupe" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" in ('chat_done', 'needs_you', 'job_done', 'job_failed'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"client" text DEFAULT 'web' NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_client_check" CHECK ("sessions"."client" in ('web', 'desktop'))
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"conversation_id" text,
	"client" text DEFAULT 'web' NOT NULL,
	"kind" text DEFAULT 'chat' NOT NULL,
	"mode" text,
	"effort" integer,
	"model_id" text NOT NULL,
	"model_label" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"reasoning_tokens" integer DEFAULT 0 NOT NULL,
	"worker_input_tokens" integer DEFAULT 0 NOT NULL,
	"worker_output_tokens" integer DEFAULT 0 NOT NULL,
	"llm_cost_usd" double precision DEFAULT 0 NOT NULL,
	"worker_cost_usd" double precision DEFAULT 0 NOT NULL,
	"web_cost_usd" double precision DEFAULT 0 NOT NULL,
	"decision_cost_usd" double precision DEFAULT 0 NOT NULL,
	"decision_calls" integer DEFAULT 0 NOT NULL,
	"web_search_calls" integer DEFAULT 0 NOT NULL,
	"web_read_calls" integer DEFAULT 0 NOT NULL,
	"web_extract_calls" integer DEFAULT 0 NOT NULL,
	"web_watch_calls" integer DEFAULT 0 NOT NULL,
	"steps" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_events_client_check" CHECK ("usage_events"."client" in ('web', 'desktop')),
	CONSTRAINT "usage_events_kind_check" CHECK ("usage_events"."kind" in ('chat', 'voice', 'tool', 'job'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"modes" text[] DEFAULT '{ultrafast}'::text[] NOT NULL,
	"show_usage" boolean DEFAULT false NOT NULL,
	"usage_cap_usd" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"notify" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('user', 'admin')),
	CONSTRAINT "users_status_check" CHECK ("users"."status" in ('active', 'blocked')),
	CONSTRAINT "users_modes_check" CHECK (cardinality("users"."modes") >= 1),
	CONSTRAINT "users_usage_cap_check" CHECK ("users"."usage_cap_usd" is null or "users"."usage_cap_usd" > 0)
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_user_updated_idx" ON "conversations" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "job_runs_job_idx" ON "job_runs" USING btree ("job_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "jobs_user_idx" ON "jobs" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "jobs_due_idx" ON "jobs" USING btree ("status","next_run_at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_unique" ON "notifications" USING btree ("user_id","dedupe");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "usage_events_created_idx" ON "usage_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "usage_events_user_created_idx" ON "usage_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");