import { failureGraphCache } from './FailureGraphCache.js';
import { createCanonicalFailureGraph, normalizeFailureCode } from '../failures/CanonicalFailureGraph.js';
import { hydrateFailureGraphArtifact, validateFailureGraphArtifact } from '../failures/FailureGraphArtifact.js';

class FailureGraphManager {
    constructor() {
        this.failures = new Map();
        this.failuresByCode = new Map();
        this.edges = [];
        this.symptoms = new Map();
        this.runtimeGraph = createCanonicalFailureGraph();
        this.graphArtifact = this.runtimeGraph;
        this.initialized = false;
        this.remotePublicationsUnavailable = false;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            const cached = failureGraphCache.load();
            if (cached) {
                this.loadFromCache(cached);
            }

            const supabase = await this.getSupabaseClient();
            if (!supabase) {
                if (this.failures.size === 0) {
                    console.log('Using local failure graph (Supabase unavailable)');
                    this.loadRuntimeFallback();
                }
                this.initialized = true;
                return;
            }

            const artifact = await this.fetchPublishedArtifact(supabase);
            if (artifact) {
                this.loadArtifact(artifact);
                failureGraphCache.save({
                    graphArtifact: this.graphArtifact,
                    cachedAt: new Date().toISOString()
                });
            } else {
                const rowset = await this.fetchLegacyRowset(supabase);
                if (rowset) {
                    this.loadPublishedRows(rowset);
                    failureGraphCache.save({
                        ...rowset,
                        graphArtifact: this.graphArtifact,
                        cachedAt: new Date().toISOString()
                    });
                }
            }

            if (this.failures.size === 0) {
                console.log('Using local failure graph (no remote data available)');
                this.loadRuntimeFallback();
            }

            this.initialized = true;
            console.log(`Failure Graph Loaded: ${this.failures.size} failures, ${this.edges.length} edges, ${this.symptoms.size} symptom sets.`);
        } catch (error) {
            console.error('Failed to initialize Failure Graph:', error);
            const cached = failureGraphCache.load();
            if (cached) {
                this.loadFromCache(cached);
            } else {
                this.loadRuntimeFallback();
            }
            this.initialized = true;
        }
    }

    async getSupabaseClient() {
        if (typeof window === 'undefined') {
            return null;
        }

        try {
            const module = await import('./SupabaseClient.js');
            return module.supabase || null;
        } catch (error) {
            console.warn('Supabase client unavailable for FailureGraphManager.', error);
            return null;
        }
    }

    async fetchPublishedArtifact(supabase) {
        if (this.remotePublicationsUnavailable) {
            return null;
        }

        try {
            const { data: publication, error: publicationError } = await supabase
                .from('failure_graph_publications')
                .select(`
                    channel,
                    version_id,
                    failure_graph_versions (
                        id,
                        version,
                        status,
                        artifact_hash,
                        schema_version,
                        generated_at,
                        provenance,
                        failure_graph_artifacts (
                            artifact_json,
                            validation_report,
                            artifact_size_bytes
                        )
                    )
                `)
                .eq('channel', 'runtime')
                .single();

            if (publicationError) {
                if (publicationError.code === 'PGRST205' || publicationError.code === '42P01' || publicationError.status === 404) {
                    this.remotePublicationsUnavailable = true;
                }
                return null;
            }

            const versionRow = publication?.failure_graph_versions;
        const artifactRow = Array.isArray(versionRow?.failure_graph_artifacts)
            ? versionRow.failure_graph_artifacts[0]
            : versionRow?.failure_graph_artifacts;

        if (!versionRow || !artifactRow?.artifact_json) {
            return null;
        }

        const validation = validateFailureGraphArtifact(artifactRow.artifact_json);
        if (!validation.valid) {
            console.warn('Published failure graph artifact failed validation.', validation.errors);
            return null;
        }

        if (versionRow.artifact_hash && validation.recomputedHash !== versionRow.artifact_hash) {
            console.warn('Published failure graph artifact hash mismatch.', {
                expected: versionRow.artifact_hash,
                actual: validation.recomputedHash
            });
            return null;
        }

        return {
            ...validation.artifact,
            metadata: {
                ...validation.artifact.metadata,
                version: versionRow.version || validation.artifact.metadata.version,
                generated_at: versionRow.generated_at || validation.artifact.metadata.generated_at,
                schema_version: versionRow.schema_version || validation.artifact.metadata.schema_version,
                provenance: {
                    ...(validation.artifact.metadata.provenance || {}),
                    publication_channel: publication.channel,
                    supabase_version_id: versionRow.id,
                    validation_report: artifactRow.validation_report || null,
                    artifact_size_bytes: artifactRow.artifact_size_bytes || null
                },
                hash: validation.recomputedHash
            }
        };
        } catch (error) {
            return null;
        }
    }

    async fetchLegacyRowset(supabase) {
        const { data: failures, error: failuresError } = await supabase
            .from('skylinetragedy_failures')
            .select('*');
        if (failuresError) throw failuresError;

        const { data: edges, error: edgesError } = await supabase
            .from('skylinetragedy_failure_edges')
            .select('*');
        if (edgesError) throw edgesError;

        const { data: symptoms, error: symptomsError } = await supabase
            .from('skylinetragedy_failure_symptoms')
            .select('*');
        if (symptomsError) throw symptomsError;

        if (!failures || !edges || !symptoms) {
            return null;
        }

        return { failures, edges, symptoms };
    }

    resetState() {
        this.failures = new Map();
        this.failuresByCode = new Map();
        this.edges = [];
        this.symptoms = new Map();
    }

    loadRuntimeFallback() {
        this.resetState();
        this.loadArtifact(this.runtimeGraph);
        this.initialized = true;
    }

    initializeRuntimeGraph() {
        this.loadRuntimeFallback();
        return this.getRuntimeGraphView();
    }

    getRuntimeGraphView() {
        const artifact = this.getGraphArtifact();
        return {
            source: 'runtime',
            artifact,
            failures: this.getAllFailures(),
            edges: this.getAllEdges(),
            metadata: artifact?.metadata || {}
        };
    }

    loadArtifact(artifact) {
        const hydrated = hydrateFailureGraphArtifact(artifact);
        this.resetState();
        this.graphArtifact = hydrated;

        hydrated.nodes.forEach((node) => {
            const record = {
                id: node.runtimeId,
                runtime_id: node.runtimeId,
                failure_code: node.id,
                canonical_id: node.id,
                system: node.subsystem,
                category: node.category,
                description: node.name,
                stages: node.stages,
                applicability: node.applicability,
                observables: node.observables,
                mitigation_hooks: node.mitigationHooks,
                narrative_hook_ids: node.narrativeHookIds,
                evidence_refs: node.evidenceRefs,
                symptom_templates: node.symptomTemplates,
                graph_version: hydrated.metadata.version,
                graph_hash: hydrated.metadata.hash,
                metadata: node.metadata,
                source: node.source
            };
            this.failures.set(record.id, record);
            this.failuresByCode.set(record.failure_code, record);
        });

        this.edges = hydrated.edges.map((edge) => ({
            id: edge.id,
            cause_failure: edge.sourceRuntimeId,
            effect_failure: edge.targetRuntimeId,
            source_failure_code: edge.sourceId,
            target_failure_code: edge.targetId,
            probability: edge.probability,
            delay_seconds: edge.delaySeconds,
            propagation_type: edge.propagationType,
            cascade_class: edge.cascadeClass,
            source_stage: edge.sourceStage,
            min_source_time_in_stage: edge.minSourceTimeInStage,
            required_observables: edge.requiredObservables,
            inhibited_observables: edge.inhibitedObservables,
            guards: edge.guards,
            stage_gate: edge.stageGate,
            target_context_template: edge.targetContextTemplate,
            narrative_hook_ids: edge.narrativeHookIds,
            evidence_refs: edge.evidenceRefs,
            metadata: edge.metadata,
            sourceRuntimeId: edge.sourceRuntimeId,
            targetRuntimeId: edge.targetRuntimeId,
            sourceId: edge.sourceId,
            targetId: edge.targetId,
            delaySeconds: edge.delaySeconds,
            propagationType: edge.propagationType,
            cascadeClass: edge.cascadeClass,
            sourceStage: edge.sourceStage,
            minSourceTimeInStage: edge.minSourceTimeInStage,
            requiredObservables: edge.requiredObservables,
            inhibitedObservables: edge.inhibitedObservables,
            targetContextTemplate: edge.targetContextTemplate
        }));
    }

    createCompatibilityArtifact({ failures = [], edges = [], symptoms = [] }) {
        const nodeSymptomMap = new Map();
        const idToCode = new Map();

        failures.forEach((failure) => {
            const failureCode = normalizeFailureCode(failure.failure_code || failure.runtime_id || failure.id);
            const runtimeId = this.runtimeGraph.aliasToRuntimeId.get(failureCode) || failure.runtime_id || failure.id;
            idToCode.set(failure.id, failureCode);
            idToCode.set(runtimeId, failureCode);

            const node = {
                id: failureCode,
                runtimeId,
                aliases: [failureCode, runtimeId],
                name: failure.description || failure.component || failureCode,
                subsystem: failure.system || 'systems',
                category: failure.system || 'systems',
                applicability: failure.applicability || ['*'],
                observables: failure.observables || [],
                mitigationHooks: failure.mitigation_hooks || [],
                stages: Array.isArray(failure.stages) && failure.stages.length > 0
                    ? failure.stages
                    : [{ id: 'active', next: null, duration: null, intensityTarget: null, intensityRate: null, transitionMetadata: null, hasDynamicDuration: false, hasEffect: false }],
                narrativeHookIds: failure.narrative_hook_ids || [],
                evidenceRefs: failure.evidence_refs || [],
                symptomTemplates: [],
                metadata: {
                    legacy_failure_id: failure.id,
                    component: failure.component || null,
                    failure_mode: failure.failure_mode || null,
                    source_confidence: failure.source_confidence ?? null,
                    time_scale: failure.time_scale || null
                },
                source: 'legacy_rowset'
            };

            nodeSymptomMap.set(failureCode, node);
        });

        symptoms.forEach((symptom) => {
            const failureCode = idToCode.get(symptom.failure_id);
            if (!failureCode || !nodeSymptomMap.has(failureCode)) return;
            nodeSymptomMap.get(failureCode).symptomTemplates.push({
                sensoryType: symptom.sensory_type,
                description: symptom.description,
                instrumentRelated: Boolean(symptom.instrument_related),
                physicsRelated: Boolean(symptom.physics_related)
            });
        });

        const artifact = hydrateFailureGraphArtifact({
            metadata: {
                version: 'published-rowset-v1',
                generated_at: new Date().toISOString(),
                source_channel: 'legacy-rowset',
                provenance: {
                    source: 'supabase_row_tables',
                    compatibility_mode: true
                }
            },
            nodes: Array.from(nodeSymptomMap.values()),
            edges: (edges || []).map((edge) => ({
                id: edge.id,
                sourceId: normalizeFailureCode(edge.source_failure_code || idToCode.get(edge.cause_failure) || edge.cause_failure),
                targetId: normalizeFailureCode(edge.target_failure_code || idToCode.get(edge.effect_failure) || edge.effect_failure),
                probability: edge.probability,
                delaySeconds: edge.delay_seconds ?? edge.time_delay_seconds ?? 0,
                propagationType: edge.propagation_type || 'SYSTEM',
                sourceStage: edge.source_stage || null,
                minSourceTimeInStage: edge.min_source_time_in_stage || 0,
                requiredObservables: edge.required_observables || [],
                inhibitedObservables: edge.inhibited_observables || [],
                guards: edge.guards || [],
                stageGate: edge.stage_gate || null,
                targetContextTemplate: edge.target_context_template || {},
                narrativeHookIds: edge.narrative_hook_ids || [],
                evidenceRefs: edge.evidence_refs || [],
                metadata: {
                    legacy_edge_id: edge.id
                }
            }))
        });

        return artifact;
    }

    loadPublishedRows({ failures = [], edges = [], symptoms = [] }) {
        const artifact = this.createCompatibilityArtifact({ failures, edges, symptoms });
        this.loadArtifact(artifact);

        this.symptoms = new Map();
        artifact.nodes.forEach((node) => {
            const failureId = node.runtimeId;
            const templates = node.symptomTemplates.map((template, index) => ({
                id: `${failureId}:symptom:${index}`,
                failure_id: failureId,
                sensory_type: template.sensoryType,
                description: template.description,
                instrument_related: template.instrumentRelated,
                physics_related: template.physicsRelated
            }));
            if (templates.length > 0) {
                this.symptoms.set(failureId, templates);
            }
        });
    }

    loadFromCache(cached) {
        if (cached.graphArtifact) {
            const validation = validateFailureGraphArtifact(cached.graphArtifact);
            if (validation.valid) {
                this.loadArtifact(validation.artifact);
                this.symptoms = new Map();
                validation.artifact.nodes.forEach((node) => {
                    const templates = node.symptomTemplates.map((template, index) => ({
                        id: `${node.runtimeId}:symptom:${index}`,
                        failure_id: node.runtimeId,
                        sensory_type: template.sensoryType,
                        description: template.description,
                        instrument_related: template.instrumentRelated,
                        physics_related: template.physicsRelated
                    }));
                    if (templates.length > 0) {
                        this.symptoms.set(node.runtimeId, templates);
                    }
                });
                return;
            }
        }

        if (cached.failures && cached.edges) {
            this.loadPublishedRows({
                failures: cached.failures || [],
                edges: cached.edges || [],
                symptoms: cached.symptoms || []
            });
            return;
        }

        this.loadRuntimeFallback();
    }

    getFailure(id) {
        return this.failures.get(id) || this.failuresByCode.get(normalizeFailureCode(id));
    }

    getFailureByCode(code) {
        return this.failuresByCode.get(normalizeFailureCode(code));
    }

    getEdgesFrom(failureId) {
        const normalizedId = normalizeFailureCode(failureId);
        return this.edges.filter((edge) => edge.cause_failure === failureId || edge.source_failure_code === normalizedId);
    }

    getSymptoms(failureId) {
        return this.symptoms.get(failureId) || [];
    }

    getAllFailures() {
        return Array.from(this.failures.values());
    }

    getAllEdges() {
        return this.edges;
    }

    getGraphArtifact() {
        return this.graphArtifact;
    }
}

export const failureGraphManager = new FailureGraphManager();
