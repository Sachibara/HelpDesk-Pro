CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('opsfusion-cloud-automation-hourly','0 * * * *',
 'SELECT opsfusion_private.scan_all();');