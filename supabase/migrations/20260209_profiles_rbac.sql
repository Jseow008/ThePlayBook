-- Migration: Add profiles table with RBAC for admin authentication
-- This replaces the environment variable password with proper Supabase Auth

-- ==========================================================================
-- USER ROLE ENUM
-- ==========================================================================

CREATE TYPE user_role AS ENUM ('user', 'admin');

-- ==========================================================================
-- PROFILES TABLE
-- ==========================================================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role user_role DEFAULT 'user' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick role lookups
CREATE INDEX idx_profiles_role ON profiles(role);

-- ==========================================================================
-- ROW LEVEL SECURITY
-- ==========================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Service role has full access (for admin operations)
CREATE POLICY "Service role has full access to profiles"
  ON profiles FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ==========================================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ==========================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ==========================================================================
-- HELPER FUNCTION: CHECK IF CURRENT USER IS ADMIN
-- ==========================================================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================================================
-- UPDATE TRIGGER FOR PROFILES
-- ==========================================================================

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
