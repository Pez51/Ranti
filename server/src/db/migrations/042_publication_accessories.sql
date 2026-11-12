ALTER TABLE publications ADD COLUMN accessories text CHECK (length(accessories) BETWEEN 1 AND 500);

CREATE OR REPLACE FUNCTION bump_publication_contract_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF ROW(NEW.title,NEW.description,NEW.category,NEW.condition,NEW.modality,
        NEW.price,NEW.guarantee_amount,NEW.available_from,NEW.available_until,NEW.rental_unit,NEW.guarantee_required,NEW.accessories)
       IS DISTINCT FROM
       ROW(OLD.title,OLD.description,OLD.category,OLD.condition,OLD.modality,
        OLD.price,OLD.guarantee_amount,OLD.available_from,OLD.available_until,OLD.rental_unit,OLD.guarantee_required,OLD.accessories) THEN
        NEW.contract_version:=OLD.contract_version+1;
    ELSE NEW.contract_version:=OLD.contract_version;
    END IF;
    RETURN NEW;
END;
$$;
