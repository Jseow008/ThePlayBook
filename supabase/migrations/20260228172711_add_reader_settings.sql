-- Production-recorded version 20260228172711: add cross-device reader settings
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reader_settings jsonb DEFAULT '{}'::jsonb;
