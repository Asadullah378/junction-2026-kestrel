ALTER TABLE "job_runs" DROP CONSTRAINT "job_runs_trigger_check";--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_check";--> statement-breakpoint
ALTER TABLE "job_runs" ADD COLUMN "snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "job_runs" ADD COLUMN "changes" jsonb;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "kind" text DEFAULT 'job' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "watch" jsonb;--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_trigger_check" CHECK ("job_runs"."trigger" in ('schedule', 'manual', 'webhook'));--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_kind_check" CHECK ("jobs"."kind" in ('job', 'watch'));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" in ('chat_done', 'needs_you', 'job_done', 'job_failed', 'watch_changed'));