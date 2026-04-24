-- Undo the X-Road 7.8.0 messagelog/11-attachments.xml migration, restoring
-- the 7.5.1 shape of logrecord.attachment + the t_logrecord_attachment
-- trigger. The trigger and function bodies below are copied verbatim from
-- X-Road 7.5.1's messagelog/6-rest-message.xml.

\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'messagelog'
      AND table_name   = 'logrecord'
      AND column_name  = 'attachment'
  ) THEN
    RAISE EXCEPTION 'messagelog.logrecord.attachment already exists — nothing to roll back';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'messagelog' AND table_name = 'message_attachment'
  ) THEN
    RAISE EXCEPTION 'messagelog.message_attachment missing — schema not in 7.8.0 shape';
  END IF;

  IF EXISTS (
    SELECT 1 FROM messagelog.message_attachment
    GROUP BY logrecord_id HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Some logrecords have >1 attachment — rollback would be lossy';
  END IF;

  IF EXISTS (
    SELECT 1 FROM messagelog.message_attachment WHERE attachment_no <> 1
  ) THEN
    RAISE EXCEPTION 'Found message_attachment rows with attachment_no <> 1 — UPDATE below would strand their OIDs';
  END IF;
END
$guard$;

ALTER TABLE messagelog.logrecord ADD COLUMN attachment oid;

UPDATE messagelog.logrecord lr
SET attachment = ma.attachment
FROM messagelog.message_attachment ma
WHERE ma.logrecord_id = lr.id AND ma.attachment_no = 1;

CREATE OR REPLACE FUNCTION messagelog.del_logrecord_attachment()
  RETURNS trigger LANGUAGE plpgsql AS
$func$
BEGIN
  PERFORM LO_UNLINK(OLD.ATTACHMENT);
  RETURN OLD;
END;
$func$;

DROP TRIGGER IF EXISTS t_logrecord_attachment ON messagelog.logrecord;
CREATE TRIGGER t_logrecord_attachment
  BEFORE DELETE ON messagelog.logrecord
  FOR EACH ROW WHEN (old.attachment IS NOT NULL)
  EXECUTE PROCEDURE messagelog.del_logrecord_attachment();

DROP TRIGGER IF EXISTS t_logrecord_del_attachments ON messagelog.logrecord;
DROP FUNCTION IF EXISTS messagelog.del_message_attachments();
DROP TRIGGER IF EXISTS t_message_attachment_del_lo ON messagelog.message_attachment;
DROP FUNCTION IF EXISTS messagelog.del_message_attachment_lo();
DROP TABLE messagelog.message_attachment;

-- Forget the 11-attachments changesets so a future 7.8.0 deploy replays
-- them cleanly against the restored 7.5.1 schema.
DELETE FROM messagelog.databasechangelog
WHERE filename = 'messagelog/11-attachments.xml';

COMMIT;
