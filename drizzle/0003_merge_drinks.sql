-- Merge category references only; amounts, dates, notes, tags and IDs stay intact.
UPDATE transactions SET category_id = 'entertainment-0' WHERE category_id = 'food-2';
