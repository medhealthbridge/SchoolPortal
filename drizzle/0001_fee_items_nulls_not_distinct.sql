ALTER TABLE "fee_items" DROP CONSTRAINT "fee_items_uq";--> statement-breakpoint
ALTER TABLE "fee_items" ADD CONSTRAINT "fee_items_uq" UNIQUE NULLS NOT DISTINCT("school_year_id","name","level");