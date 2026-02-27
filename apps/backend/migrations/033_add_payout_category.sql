-- Add category column for payout classification (place finish vs points finish)
ALTER TABLE league_payments
    ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('place', 'points'));
