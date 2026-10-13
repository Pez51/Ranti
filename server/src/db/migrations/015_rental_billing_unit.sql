ALTER TABLE publications ADD COLUMN rental_unit text NOT NULL DEFAULT 'day'
    CHECK (rental_unit IN ('hour','day','week','month'));
ALTER TABLE operations ADD COLUMN requested_rental_unit text
    CHECK (requested_rental_unit IN ('hour','day','week','month'));
UPDATE operations SET requested_rental_unit='day' WHERE modality='Alquiler';
CREATE OR REPLACE FUNCTION bump_publication_contract_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF ROW(NEW.title,NEW.description,NEW.category,NEW.condition,NEW.modality,
        NEW.price,NEW.guarantee_amount,NEW.available_from,NEW.available_until,NEW.rental_unit)
       IS DISTINCT FROM
       ROW(OLD.title,OLD.description,OLD.category,OLD.condition,OLD.modality,
        OLD.price,OLD.guarantee_amount,OLD.available_from,OLD.available_until,OLD.rental_unit) THEN
        NEW.contract_version:=OLD.contract_version+1;
    ELSE NEW.contract_version:=OLD.contract_version;
    END IF;
    RETURN NEW;
END;
$$;
