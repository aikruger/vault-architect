import {
  PluginSettings,
  CurrentNote,
  ExtractedNoteData,
  RecommendationResult,
  FolderRecommendation,
  FolderProfile,
  VaultAnalysisReport,
  ChatMessage,
  OpenAIRequest
} from '../models/types';
import { OpenAIAdapter } from '../adapters/OpenAIAdapter';

export class LLMCoordinator {
  private openaiAdapter: OpenAIAdapter;

  constructor(private settings: PluginSettings) {
    this.openaiAdapter = new OpenAIAdapter(settings);
  }

  async recommendFolder(
    noteData: CurrentNote,
    folderProfiles: FolderProfile[]
  ): Promise<RecommendationResult> {
    const startTime = Date.now();

    // Build context about vault structure
    const vaultContext = this.buildVaultContext(folderProfiles);

    // Create system prompt
    const systemPrompt = this.createRecommendationSystemPrompt();

    // Create user prompt
    const userPrompt = this.createRecommendationUserPrompt(noteData, folderProfiles);

    // Call LLM
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const response = await this.openaiAdapter.call(messages, {
      temperature: this.settings.temperature,
      model: this.settings.openaiModel,
      maxTokens: this.settings.maxTokens
    });

    // Parse response
    const result = this.parseRecommendationResponse(response.content, folderProfiles);

    result.analysisMetadata.processingTime = Date.now() - startTime;
    result.analysisMetadata.tokensUsed = response.tokensUsed;

    return result;
  }

  async analyzeVault(folderProfiles: FolderProfile[]): Promise<VaultAnalysisReport> {
    // Create analysis prompt
    const systemPrompt = this.createAnalysisSystemPrompt();
    const userPrompt = this.createAnalysisUserPrompt(folderProfiles);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const response = await this.openaiAdapter.call(messages, {
      temperature: 0.5,
      model: this.settings.openaiModel,
      maxTokens: 2000
    });

    // Parse and structure analysis report
    const report = this.parseAnalysisResponse(response.content, folderProfiles);

    return report;
  }

  async generateFolderNoteContent(summaries: string[]): Promise<string> {
    const prompt = `Analyze these notes:
${summaries.join('\n')}

Generate a comprehensive Folder Note content (Markdown) including:
1. Thematic summary
2. Key concepts
3. Key files list
4. Connections`;

    const messages: ChatMessage[] = [{ role: 'user', content: prompt }];

    const response = await this.openaiAdapter.call(messages, {
        model: this.settings.openaiModel,
        temperature: 0.7,
        maxTokens: 1000
    });

    return response.content;
  }

  // ============================================
  // PROMPT ENGINEERING
  // ============================================

  private createRecommendationSystemPrompt(): string {
    return `You are a knowledge architect and organizational specialist. Your expertise includes:
- Personal Knowledge Management (PKM) systems
- Information architecture and taxonomy design
- Actor-Network Theory applied to knowledge organization
- Semantic classification and categorization
- Understanding how individuals organize information

Your task is to recommend the most appropriate folder for a note based on:
1. The note's semantic content (heading, tags, key topics)
2. The existing vault structure and folder purposes
3. Thematic alignment and coherence
4. Best practices in knowledge organization

When making recommendations:
- Consider semantic similarity to existing folder content
- Look for thematic alignment with folder notes/descriptions
- Suggest creating new folders only when truly necessary
- Provide clear reasoning for your recommendations
- Be specific about which aspects of the note drive the recommendation

Format your response as valid JSON (see example below).`;
  }

  private createRecommendationUserPrompt(
    noteData: CurrentNote,
    folderProfiles: FolderProfile[]
  ): string {
    const foldersList = folderProfiles.map(fp =>
      `Folder: "${fp.folderPath}"
  Description: ${fp.description}
  Files: ${fp.fileCount}
  Examples: ${fp.examples.join(', ')}
  Folder Note: ${fp.folderNote?.description || 'None'}`
    ).join('\n\n');

    return `Analyze this note and recommend the best folder:

NOTE DETAILS:
Title: "${noteData.title}"
Tags: ${noteData.tags.length > 0 ? noteData.tags.join(', ') : 'None'}
Content Preview: ${noteData.contentPreview}
Headings: ${noteData.headings.join(' > ') || 'None'}

EXISTING FOLDERS:
${foldersList}

RECOMMENDATION REQUEST:
1. What is the primary folder recommendation? (with confidence 0-100%)
2. Why is this folder appropriate?
3. What are 2 alternative folders?
4. Should a new folder be created instead? If yes, what should it be named?

Respond with valid JSON following this structure:
{
  "primaryRecommendation": {
    "folderPath": "path/to/folder",
    "confidence": 85,
    "reasoning": "This folder contains similar notes about...",
    "matchedTopics": ["topic1", "topic2"]
  },
  "alternatives": [
    {"folderPath": "...", "confidence": 70, "reasoning": "..."}
  ],
  "suggestedNewFolder": {
    "name": "New Folder Name",
    "reasoning": "No existing folder adequately covers...",
    "suggestedParent": "parent/folder/path"
  }
}`;
  }

  private createAnalysisSystemPrompt(): string {
    return `You are a vault organization analyst. Analyze the entire vault structure and provide:
1. Issues with current organization
2. Recommendations for improvement
3. Specific file movement recommendations
4. New folder suggestions

Consider:
- Semantic coherence of folders
- File distribution and balance
- Naming clarity
- Hierarchical organization
- Reduction of overlap

Be specific and actionable in recommendations.`;
  }

  private createAnalysisUserPrompt(folderProfiles: FolderProfile[]): string {
    const folderStats = folderProfiles.map(fp =>
      `${fp.folderPath}: ${fp.fileCount} files, coherence: ${fp.coherenceScore}`
    ).join('\n');

    return `Analyze this vault organization:

${folderStats}

Provide a JSON analysis with:
{
  "issues": [{"type": "overcrowded|orphaned|...", "severity": "high|medium|low", "description": "..."}],
  "recommendations": [{"type": "move|create|rename|merge", "description": "..."}],
  "optimizationScore": {"current": 65, "potential": 85, "improvement": 20}
}`;
  }

  // ============================================
  // RESPONSE PARSING
  // ============================================

  private parseRecommendationResponse(
    content: string,
    folderProfiles: FolderProfile[]
  ): RecommendationResult {
    try {
      const json = JSON.parse(content) as {
          primaryRecommendation: {
              folderPath: string;
              confidence: number;
              reasoning: string;
              matchedTopics?: string[];
          };
          alternatives?: Array<{
              folderPath: string;
              confidence: number;
              reasoning: string;
              matchedTopics?: string[];
          }>;
          suggestedNewFolder?: {
              name: string;
              reasoning: string;
              suggestedParent?: string;
          };
      };

      const primaryRec = json.primaryRecommendation;
      const primaryFolder = folderProfiles.find(f => f.folderPath === primaryRec.folderPath);

      return {
        primaryRecommendation: {
          folderPath: primaryRec.folderPath,
          folderName: primaryFolder?.folderName || primaryRec.folderPath,
          confidence: primaryRec.confidence,
          reasoning: primaryRec.reasoning,
          matchedTopics: primaryRec.matchedTopics || [],
          matchStrength: primaryRec.confidence > 80 ? 'strong' :
                        primaryRec.confidence > 60 ? 'moderate' : 'weak'
        },
        alternatives: (json.alternatives || []).map((alt) => ({
          folderPath: alt.folderPath,
          folderName: folderProfiles.find(f => f.folderPath === alt.folderPath)?.folderName || alt.folderPath,
          confidence: alt.confidence,
          reasoning: alt.reasoning,
          matchedTopics: alt.matchedTopics || [],
          matchStrength: 'moderate' as const
        })),
        shouldCreateNewFolder: !!json.suggestedNewFolder && !!json.suggestedNewFolder.name,
        suggestedNewFolder: json.suggestedNewFolder,
        analysisMetadata: {
          timestamp: Date.now(),
          processingTime: 0,
          modelsUsed: ['openai-' + this.settings.openaiModel]
        }
      };
    } catch (error) {
       // @ts-ignore
      throw new Error(`Failed to parse LLM response: ${error.message}`);
    }
  }

  private parseAnalysisResponse(content: string, folderProfiles: FolderProfile[]): VaultAnalysisReport {
    try {
      const json = JSON.parse(content) as Partial<VaultAnalysisReport>;

      return {
        vaultStats: {
          totalNotes: folderProfiles.reduce((sum, fp) => sum + fp.fileCount, 0),
          totalFolders: folderProfiles.length,
          avgNotesPerFolder: folderProfiles.reduce((sum, fp) => sum + fp.fileCount, 0) / folderProfiles.length,
          largestFolder: folderProfiles.reduce((max, fp) =>
            fp.fileCount > max.count ? { path: fp.folderPath, count: fp.fileCount } : max,
            { path: '', count: 0 }
          ),
          smallestFolder: folderProfiles.reduce((min, fp) =>
            fp.fileCount < min.count && fp.fileCount > 0 ? { path: fp.folderPath, count: fp.fileCount } : min,
            { path: '', count: Infinity }
          )
        },
        issues: json.issues || [],
        recommendations: json.recommendations || [],
        optimizationScore: json.optimizationScore || { current: 0, potential: 0, improvement: 0 }
      };
    } catch (error) {
       // @ts-ignore
      throw new Error(`Failed to parse analysis response: ${error.message}`);
    }
  }

  private buildVaultContext(folderProfiles: FolderProfile[]): string {
    // Build human-readable context about vault structure
    return folderProfiles
      .map(fp => `${fp.folderPath}: ${fp.description} (${fp.fileCount} files)`)
      .join('\n');
  }
}
