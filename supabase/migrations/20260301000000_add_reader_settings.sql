-- Add reader_settings to profiles to enable cross-device sync of reading preferences
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reader_settings jsonb DEFAULT '{}'::jsonb;
