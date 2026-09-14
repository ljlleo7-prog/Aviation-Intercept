-- Database schema for SkylineTragedy failure graph

-- Legacy row tables retained as migration inputs / compatibility sources.
CREATE TABLE IF NOT EXISTS skylinetragedy_failures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    failure_code TEXT UNIQUE NOT NULL,
    runtime_id TEXT,
    system TEXT NOT NULL,
    component TEXT,
    failure_mode TEXT,
    description TEXT,
    severity INTEGER,
    time_scale TEXT,
    source_confidence FLOAT,
    applicability JSONB DEFAULT '[]'::jsonb,
    observables JSONB DEFAULT '[]'::jsonb,
    mitigation_hooks JSONB DEFAULT '[]'::jsonb,
    stages JSONB DEFAULT '[]'::jsonb,
    narrative_hook_ids JSONB DEFAULT '[]'::jsonb,
    evidence_refs JSONB DEFAULT '[]'::jsonb,
    symptom_templates JSONB DEFAULT '[]'::jsonb,
    source TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skylinetragedy_failure_symptoms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    failure_id UUID REFERENCES skylinetragedy_failures(id) ON DELETE CASCADE,
    sensory_type TEXT CHECK (sensory_type IN ('visual', 'auditory', 'tactile', 'smell', 'handling')),
    description TEXT,
    instrument_related BOOLEAN DEFAULT FALSE,
    physics_related BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS skylinetragedy_failure_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cause_failure UUID REFERENCES skylinetragedy_failures(id) ON DELETE CASCADE,
    effect_failure UUID REFERENCES skylinetragedy_failures(id) ON DELETE CASCADE,
    source_failure_code TEXT,
    target_failure_code TEXT,
    probability FLOAT DEFAULT 1.0,
    delay_seconds INTEGER DEFAULT 0,
    time_delay_seconds INTEGER DEFAULT 0,
    propagation_type TEXT CHECK (propagation_type IN ('SYSTEM', 'PROCEDURAL', 'HUMAN_FACTOR', 'PHYSICS')),
    source_stage TEXT,
    min_source_time_in_stage INTEGER DEFAULT 0,
    required_observables JSONB DEFAULT '[]'::jsonb,
    inhibited_observables JSONB DEFAULT '[]'::jsonb,
    guards JSONB DEFAULT '[]'::jsonb,
    stage_gate JSONB,
    target_context_template JSONB DEFAULT '{}'::jsonb,
    narrative_hook_ids JSONB DEFAULT '[]'::jsonb,
    evidence_refs JSONB DEFAULT '[]'::jsonb,
    condition_logic JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS skylinetragedy_failure_edges_codes_unique
ON skylinetragedy_failure_edges (source_failure_code, target_failure_code, propagation_type);

CREATE TABLE IF NOT EXISTS skylinetragedy_failure_effects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    failure_code TEXT NOT NULL,
    effect_type TEXT NOT NULL,
    parameters JSONB DEFAULT '{}'::jsonb,
    simulation_logic TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS skylinetragedy_failure_effects_unique
ON skylinetragedy_failure_effects (failure_code, effect_type, simulation_logic);

CREATE TABLE IF NOT EXISTS skylinetragedy_revision_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposed_node JSONB,
    proposed_edges JSONB,
    source_document TEXT,
    status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Artifact-first persistence layer.
CREATE TABLE IF NOT EXISTS failure_graph_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'validated', 'published', 'deprecated')),
    artifact_hash TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    provenance JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS failure_graph_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL UNIQUE REFERENCES failure_graph_versions(id) ON DELETE CASCADE,
    artifact_json JSONB NOT NULL,
    validation_report JSONB DEFAULT '{}'::jsonb,
    artifact_size_bytes INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS failure_graph_publications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel TEXT NOT NULL UNIQUE,
    version_id UUID NOT NULL REFERENCES failure_graph_versions(id) ON DELETE CASCADE,
    published_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS failure_graph_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_key TEXT UNIQUE,
    title TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'applied')) DEFAULT 'pending',
    base_version_id UUID REFERENCES failure_graph_versions(id) ON DELETE SET NULL,
    patch_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_document TEXT,
    author TEXT,
    review_notes JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS failure_graph_validation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES failure_graph_versions(id) ON DELETE CASCADE,
    validator_version TEXT NOT NULL,
    passed BOOLEAN NOT NULL DEFAULT FALSE,
    warnings JSONB DEFAULT '[]'::jsonb,
    errors JSONB DEFAULT '[]'::jsonb,
    report_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skylinetragedy_narratives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signature TEXT UNIQUE NOT NULL,
    content TEXT NOT NULL,
    symptoms JSONB,
    source_document TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skylinetragedy_atc_phrase_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intent TEXT NOT NULL,
    speaker TEXT NOT NULL,
    speaker_role TEXT NOT NULL,
    language TEXT DEFAULT 'EN',
    phrase_template TEXT NOT NULL,
    parameters JSONB,
    phase_of_flight TEXT,
    source TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE skylinetragedy_atc_phrase_templates
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'EN';

UPDATE skylinetragedy_atc_phrase_templates
SET language = 'EN'
WHERE language IS NULL;

ALTER TABLE skylinetragedy_atc_phrase_templates
ALTER COLUMN language SET NOT NULL;

DROP INDEX IF EXISTS skylinetragedy_atc_phrase_templates_unique;

CREATE UNIQUE INDEX IF NOT EXISTS skylinetragedy_atc_phrase_templates_unique
ON skylinetragedy_atc_phrase_templates (intent, speaker, speaker_role, language, phrase_template, phase_of_flight, source);

ALTER TABLE skylinetragedy_atc_phrase_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'skylinetragedy_atc_phrase_templates'
          AND policyname = 'skylinetragedy_atc_phrase_templates_read'
    ) THEN
        CREATE POLICY skylinetragedy_atc_phrase_templates_read
        ON skylinetragedy_atc_phrase_templates
        FOR SELECT
        TO anon, authenticated
        USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'skylinetragedy_atc_phrase_templates'
          AND policyname = 'skylinetragedy_atc_phrase_templates_write'
    ) THEN
        CREATE POLICY skylinetragedy_atc_phrase_templates_write
        ON skylinetragedy_atc_phrase_templates
        FOR INSERT
        TO authenticated
        WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'skylinetragedy_atc_phrase_templates'
          AND policyname = 'skylinetragedy_atc_phrase_templates_update'
    ) THEN
        CREATE POLICY skylinetragedy_atc_phrase_templates_update
        ON skylinetragedy_atc_phrase_templates
        FOR UPDATE
        TO authenticated
        USING (true)
        WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'skylinetragedy_atc_phrase_templates'
          AND policyname = 'skylinetragedy_atc_phrase_templates_delete'
    ) THEN
        CREATE POLICY skylinetragedy_atc_phrase_templates_delete
        ON skylinetragedy_atc_phrase_templates
        FOR DELETE
        TO authenticated
        USING (true);
    END IF;
END $$;
