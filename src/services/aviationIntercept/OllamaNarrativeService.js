const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL = 'llama3';

class OllamaNarrativeService {
    async generate(symptoms) {
        const prompt = this.buildPrompt(symptoms);
        const response = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL,
                prompt,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama error: ${response.statusText}`);
        }

        const result = await response.json();
        return String(result.response || '').trim();
    }

    buildPrompt(symptoms) {
        const symptomList = symptoms.map(s => `- ${s.sensory_type}: ${s.description}`).join('\n');
        return `You are generating a short pilot sensory narration for a flight simulator.
Rules:
- Describe sensations, not system names or failure codes.
- Do not mention cockpit instruments or UI indicators.
- Do not describe aircraft motion that is already simulated by physics.
- Keep it to one or two sentences.
Symptoms:
${symptomList}
Output only the narration text.`;
    }
}

export const ollamaNarrativeService = new OllamaNarrativeService();
