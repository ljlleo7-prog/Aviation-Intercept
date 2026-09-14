import { supabase } from './SupabaseClient.js';

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL = 'llama3';

class LLMKnowledgeExpander {
    async processGapLogs(logs) {
        if (!logs || logs.length === 0) return;

        for (const log of logs) {
            await this.expandKnowledge(log);
        }
    }

    async expandKnowledge(log) {
        const prompt = this.constructPrompt(log);

        try {
            const response = await fetch(OLLAMA_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: MODEL,
                    prompt: prompt,
                    stream: false,
                    format: "json"
                })
            });

            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.statusText}`);
            }

            const result = await response.json();
            const proposal = JSON.parse(result.response);

            await this.saveProposal(proposal, log);
            console.log('Proposal saved for log:', log);

        } catch (error) {
            console.error('Failed to expand knowledge:', error);
        }
    }

    constructPrompt(log) {
        return `
You are an expert aviation safety systems engineer.
We have detected a gap in our simulation failure graph.
Observed Event:
- Triggered Failure: ${log.failure_triggered}
- Observed Effect: ${log.observed_effect}
- Existing Cascade: ${log.existing_cascade}

Task:
1. Search your knowledge base (NTSB, ASRS, FAA, EASA) for real-world incidents matching this pattern.
2. Propose a new Failure Node and/or Edges to model this cascade.
3. Output strictly valid JSON with the following structure:
{
  "proposed_node": {
    "failure_code": "NEW_CODE",
    "system": "SYSTEM_NAME",
    "description": "Description",
    "severity": 1-10,
    "time_scale": "immediate/slow",
    "source_confidence": 0.0-1.0
  },
  "proposed_edges": [
    {
      "cause_failure": "PARENT_CODE",
      "effect_failure": "NEW_CODE",
      "probability": 0.0-1.0,
      "delay_seconds": 0,
      "propagation_type": "SYSTEM/PROCEDURAL/HUMAN_FACTOR/PHYSICS"
    }
  ],
  "source_document": "Citation or Report ID"
}

Do not include any text outside the JSON.
`;
    }

    async saveProposal(proposal, log) {
        const { error } = await supabase
            .from('skylinetragedy_revision_proposals')
            .insert({
                proposed_node: proposal.proposed_node,
                proposed_edges: proposal.proposed_edges,
                source_document: proposal.source_document,
                status: 'pending'
            });

        if (error) throw error;
    }
}

export const llmKnowledgeExpander = new LLMKnowledgeExpander();
