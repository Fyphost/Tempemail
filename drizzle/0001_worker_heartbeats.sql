CREATE TABLE "worker_heartbeats" (
	"id" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"smtp_listening" boolean DEFAULT false NOT NULL,
	"smtp_port" integer,
	"smtp_tls" boolean DEFAULT false NOT NULL
);
