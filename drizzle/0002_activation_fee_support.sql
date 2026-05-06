ALTER TABLE "challenges" ADD COLUMN "initial_cost" decimal(10,2) DEFAULT '0' NOT NULL;
--> statement-breakpoint
UPDATE "challenges" SET "initial_cost" = "cost" WHERE "initial_cost" = '0';
--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "has_activation_fee" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "activation_fee_amount" decimal(10,2);
