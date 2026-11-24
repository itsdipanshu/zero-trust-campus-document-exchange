-- ============================================================
-- CAMPUSVAULT – SUPABASE DATABASE SCHEMA & ROW LEVEL SECURITY
-- ============================================================
-- Zero-Trust Campus Document Exchange Database
-- Tables: profiles, departments, documents, access_grants, audit_logs
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── 1. DEPARTMENTS TABLE ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. PROFILES TABLE ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'faculty', 'hod', 'admin')),
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 3. DOCUMENTS TABLE ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  classification TEXT NOT NULL DEFAULT 'internal' CHECK (classification IN ('public', 'internal', 'confidential', 'restricted')),
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  storage_path TEXT UNIQUE NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 4. ACCESS GRANTS TABLE ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.access_grants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  granted_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 5. AUDIT LOGS TABLE ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  decision TEXT CHECK (decision IN ('allowed', 'denied', 'pending')),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_dept ON public.profiles(department_id);
CREATE INDEX IF NOT EXISTS idx_documents_dept ON public.documents(department_id);
CREATE INDEX IF NOT EXISTS idx_documents_class ON public.documents(classification);
CREATE INDEX IF NOT EXISTS idx_grants_user_doc ON public.access_grants(user_id, document_id);
CREATE INDEX IF NOT EXISTS idx_grants_status ON public.access_grants(status);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs(created_at);

-- ============================================================
-- PART 4 – ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user has admin role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'hod')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── DEPARTMENTS POLICIES ─────────────────────────────────────
-- Anyone authenticated can view departments
CREATE POLICY "Departments are viewable by authenticated users"
ON public.departments FOR SELECT
USING (auth.role() = 'authenticated' OR true);

-- Only Admins can modify departments
CREATE POLICY "Only admins can insert departments"
ON public.departments FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can update departments"
ON public.departments FOR UPDATE
USING (public.is_admin());

CREATE POLICY "Only admins can delete departments"
ON public.departments FOR DELETE
USING (public.is_admin());

-- ─── PROFILES POLICIES ────────────────────────────────────────
-- Users can view their own profile; admins can view all profiles
CREATE POLICY "Users can view own profile or admins view all"
ON public.profiles FOR SELECT
USING (auth.uid() = id OR public.is_admin());

-- Users can update their own profile name; but CANNOT change role to admin
CREATE POLICY "Users can update own profile (non-role fields)"
ON public.profiles FOR UPDATE
USING (auth.uid() = id OR public.is_admin())
WITH CHECK (
  public.is_admin() OR (
    -- Non-admin cannot escalate role or status
    role = (SELECT role FROM public.profiles WHERE id = auth.uid()) AND
    status = (SELECT status FROM public.profiles WHERE id = auth.uid())
  )
);

-- ─── DOCUMENTS POLICIES ───────────────────────────────────────
-- Select: Admins see all; users see public, their own uploads, or granted documents
CREATE POLICY "Documents viewable by authorized users"
ON public.documents FOR SELECT
USING (
  public.is_admin() OR
  classification = 'public' OR
  uploaded_by = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.access_grants
    WHERE document_id = documents.id
      AND user_id = auth.uid()
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > NOW())
  )
);

-- Insert: Only Faculty and Admin can upload documents (Students FORBIDDEN)
CREATE POLICY "Only faculty and admin can upload documents"
ON public.documents FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'faculty', 'hod')
  )
);

-- Delete: Only uploader or admin can delete
CREATE POLICY "Only uploader or admin can delete document"
ON public.documents FOR DELETE
USING (
  public.is_admin() OR uploaded_by = auth.uid()
);

-- ─── ACCESS GRANTS POLICIES ───────────────────────────────────
-- Select: Students only view own grants; admins view all
CREATE POLICY "Users view own grants or admins view all"
ON public.access_grants FOR SELECT
USING (
  user_id = auth.uid() OR public.is_admin()
);

-- Insert: Students CANNOT create grants. Only admins can grant access
CREATE POLICY "Only admins can create grants"
ON public.access_grants FOR INSERT
WITH CHECK (public.is_admin());

-- Update/Revoke: Only admins can revoke grants
CREATE POLICY "Only admins can revoke grants"
ON public.access_grants FOR UPDATE
USING (public.is_admin());

-- ─── AUDIT LOGS POLICIES ──────────────────────────────────────
-- Select: Strictly Admins only! Ordinary users cannot view audit logs
CREATE POLICY "Only admins can view audit logs"
ON public.audit_logs FOR SELECT
USING (public.is_admin());

-- Insert: Authenticated users can insert audit records of their actions
CREATE POLICY "Authenticated users can insert audit logs"
ON public.audit_logs FOR INSERT
WITH CHECK (auth.role() = 'authenticated' OR user_id = auth.uid());

-- Ordinary users CANNOT edit or delete audit logs (Immutable audit trail)
CREATE POLICY "Audit logs cannot be updated"
ON public.audit_logs FOR UPDATE
USING (false);

CREATE POLICY "Audit logs cannot be deleted"
ON public.audit_logs FOR DELETE
USING (false);

-- ============================================================
-- INITIAL SAMPLE DEPARTMENTS SEED (7 REQUIRED CAMPUS DEPTS)
-- ============================================================
INSERT INTO public.departments (name, description) VALUES
  ('Computer Science', 'Department of Computer Science and Engineering'),
  ('Information Technology', 'Department of Information Technology'),
  ('Electronics and Communication', 'Department of Electronics and Communication Engineering'),
  ('Mechanical Engineering', 'Department of Mechanical Engineering'),
  ('Civil Engineering', 'Department of Civil Engineering'),
  ('Business Administration', 'Department of Business Administration and Management'),
  ('Applied Sciences', 'Department of Applied Sciences and Humanities')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;


-- ============================================================
-- PART 5 – AI ASSISTANT & ACCESS REQUEST EXTENSION
-- ============================================================

-- Add discoverability to documents
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS discoverability TEXT NOT NULL DEFAULT 'DEPARTMENT_DISCOVERABLE' 
CHECK (discoverability IN ('DEPARTMENT_DISCOVERABLE', 'PRIVATE', 'RESTRICTED'));

CREATE INDEX IF NOT EXISTS idx_documents_discoverability ON public.documents(discoverability);

-- ─── 6. AI ACCESS REQUESTS TABLE ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_access_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_req_user ON public.ai_access_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_req_doc ON public.ai_access_requests(document_id);
CREATE INDEX IF NOT EXISTS idx_ai_req_status ON public.ai_access_requests(status);

-- ─── 7. AI CHAT SESSIONS TABLE ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Campus Document Inquiry',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_user ON public.ai_chat_sessions(user_id);

-- ─── 8. AI CHAT MESSAGES TABLE ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.ai_chat_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_role TEXT NOT NULL CHECK (message_role IN ('user', 'assistant', 'system')),
  message_content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_msg_session ON public.ai_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_msg_user ON public.ai_chat_messages(user_id);

-- RLS for AI Tables
ALTER TABLE public.ai_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

-- AI Access Requests RLS
CREATE POLICY "Users view own access requests or admins view all"
ON public.ai_access_requests FOR SELECT
USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Users can create own access requests"
ON public.ai_access_requests FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Only admins can review access requests"
ON public.ai_access_requests FOR UPDATE
USING (public.is_admin());

-- AI Chat Sessions RLS (Strict user privacy: users only view and insert their own)
CREATE POLICY "Users strictly access own AI chat sessions"
ON public.ai_chat_sessions FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- AI Chat Messages RLS (Strict user privacy: users only view and insert their own)
CREATE POLICY "Users strictly access own AI chat messages"
ON public.ai_chat_messages FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ─── 9. USER LANGUAGE PREFERENCES (PROFILES EXTENSION) ────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS website_language TEXT NOT NULL DEFAULT 'en';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ai_language TEXT NOT NULL DEFAULT 'auto';

-- ─── 10. SECURE MESSAGES TABLE ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.secure_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL DEFAULT 'direct' CHECK (message_type IN ('direct', 'document_share', 'access_request')),
  subject TEXT NOT NULL,
  message_content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SENT' CHECK (status IN ('PENDING_CONFIRMATION', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'REJECTED')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sec_msg_sender ON public.secure_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_sec_msg_recipient ON public.secure_messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_sec_msg_status ON public.secure_messages(status);
CREATE INDEX IF NOT EXISTS idx_sec_msg_created ON public.secure_messages(created_at);

-- ─── 11. SECURE MESSAGE ATTACHMENTS TABLE ──────────────────────
CREATE TABLE IF NOT EXISTS public.secure_message_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES public.secure_messages(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_msg_att_msg ON public.secure_message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_msg_att_doc ON public.secure_message_attachments(document_id);

-- ─── 12. NOTIFICATIONS TABLE ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'message' CHECK (type IN ('message', 'document_share', 'access_request', 'system')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_message_id UUID REFERENCES public.secure_messages(id) ON DELETE SET NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notif_created ON public.notifications(created_at);

-- ─── RLS POLICIES FOR SECURE MESSAGING & NOTIFICATIONS ────────
ALTER TABLE public.secure_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secure_message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Secure Messages: only sender or recipient can access
CREATE POLICY "Users can view messages where they are sender or recipient"
ON public.secure_messages FOR SELECT
USING (sender_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "Users can create messages where they are the verified sender"
ON public.secure_messages FOR INSERT
WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Recipients can update read status of received messages"
ON public.secure_messages FOR UPDATE
USING (recipient_id = auth.uid());

-- Secure Message Attachments: accessible only if user is sender or recipient of the message
CREATE POLICY "Users can view attachments for their messages"
ON public.secure_message_attachments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.secure_messages sm
    WHERE sm.id = message_id AND (sm.sender_id = auth.uid() OR sm.recipient_id = auth.uid())
  )
);

CREATE POLICY "Senders can attach documents to their messages"
ON public.secure_message_attachments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.secure_messages sm
    WHERE sm.id = message_id AND sm.sender_id = auth.uid()
  )
);

-- Notifications: strictly user private
CREATE POLICY "Users can view own notifications"
ON public.notifications FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications read status"
ON public.notifications FOR UPDATE
USING (user_id = auth.uid());

