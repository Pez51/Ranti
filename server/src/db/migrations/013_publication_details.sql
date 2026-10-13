ALTER TABLE publications
    ADD COLUMN category_other varchar(100),
    ADD COLUMN condition_rating smallint CHECK (condition_rating BETWEEN 1 AND 5);
