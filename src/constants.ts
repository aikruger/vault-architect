export const DEFAULT_SYSTEM_PROMPT = `You are an expert at organizing files in note-taking systems.
Your task is to recommend the most appropriate folder for a given note based on:
1. The note's content and topics
2. The existing folder structure
3. The coherence and organization of each folder

Provide your recommendation in JSON format with:
- primaryRecommendation: { folderPath, folderName, confidence (0-100), reasoning }
- alternatives: Array of 2-3 alternatives with same structure
- analysisMetadata: { topicsIdentified, folderCoherence, confidence }`;

export const DEFAULT_USER_PROMPT_TEMPLATE = `Analyze this note and recommend a folder for it.

Note Title: {{noteTitle}}
Tags: {{tags}}
Content Preview: {{contentPreview}}

Current Vault Structure:
{{vaultStructure}}

User Context: {{userContext}}

Recommend the best folder and provide 2-3 alternatives with reasoning.
Respond ONLY with valid JSON.`;
