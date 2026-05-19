ALTER TABLE "challenges" ADD COLUMN "purchase_group_id" text;
ALTER TABLE "challenges" ADD COLUMN "purchase_group_label" text;
ALTER TABLE "challenges" ADD COLUMN "purchase_group_size" integer;
ALTER TABLE "challenges" ADD COLUMN "purchase_group_index" integer;
CREATE INDEX "idx_challenges_purchase_group_id" ON "challenges" USING btree ("purchase_group_id");
