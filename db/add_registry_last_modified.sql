ALTER TABLE registries ADD COLUMN IF NOT EXISTS last_modified TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION update_registry_last_modified()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE registries SET last_modified = now() WHERE id = NEW.registry_id;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE registries SET last_modified = now() WHERE id = NEW.registry_id;
        IF NEW.registry_id IS DISTINCT FROM OLD.registry_id THEN
            UPDATE registries SET last_modified = now() WHERE id = OLD.registry_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE registries SET last_modified = now() WHERE id = OLD.registry_id;
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transactions_registry_modified ON transactions;
CREATE TRIGGER trg_transactions_registry_modified
AFTER INSERT OR UPDATE OR DELETE ON transactions
FOR EACH ROW EXECUTE FUNCTION update_registry_last_modified();
