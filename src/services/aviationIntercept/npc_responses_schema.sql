
-- Table: skylinetragedy_npc_responses
CREATE TABLE IF NOT EXISTS skylinetragedy_npc_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('FO', 'CABIN_CREW')),
    difficulty TEXT NOT NULL CHECK (difficulty IN ('rookie', 'amateur', 'intermediate', 'advanced', 'pro', 'devil')),
    content TEXT NOT NULL,
    vagueness INTEGER CHECK (vagueness BETWEEN 0 AND 100),
    stress_level INTEGER CHECK (stress_level BETWEEN 0 AND 100),
    accuracy_level TEXT CHECK (accuracy_level IN ('high', 'medium', 'low', 'misleading')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE skylinetragedy_npc_responses ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'skylinetragedy_npc_responses'
        AND policyname = 'skylinetragedy_npc_responses_read'
    ) THEN
        CREATE POLICY skylinetragedy_npc_responses_read
        ON skylinetragedy_npc_responses
        FOR SELECT
        TO anon, authenticated
        USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'skylinetragedy_npc_responses'
        AND policyname = 'skylinetragedy_npc_responses_insert'
    ) THEN
        CREATE POLICY skylinetragedy_npc_responses_insert
        ON skylinetragedy_npc_responses
        FOR INSERT
        TO anon, authenticated
        WITH CHECK (true);
    END IF;
END $$;
