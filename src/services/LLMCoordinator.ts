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
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_PROMPT_TEMPLATE } from '../constants';

export class LLMCoordinator {
  private openaiAdapter: OpenAIAdapter;

  constructor(private settings: PluginSettings) {
    this.openaiAdapter = new OpenAIAdapter(settings);
  }

  async recommendFolder(
    noteData: CurrentNote,
    folderProfiles: FolderProfile[],
    userContext: string = ""
  ): Promise<RecommendationResult> {
    const startTime = Date.now();

    // Create system prompt
    const systemPrompt = this.getSystemPrompt();

    // Create user prompt
    const userPrompt = this.buildUserPrompt(noteData, folderProfiles, userContext);

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

  private getSystemPrompt(): string {
    if (this.settings.useCustomPrompts && this.settings.customPrompts?.systemPrompt) {
      return this.settings.customPrompts.systemPrompt;
    }
    return DEFAULT_SYSTEM_PROMPT;
  }

  private getUserPromptTemplate(): string {
    if (this.settings.useCustomPrompts && this.settings.customPrompts?.userPromptTemplate) {
      return this.settings.customPrompts.userPromptTemplate;
    }
    return DEFAULT_USER_PROMPT_TEMPLATE;
  }

  private buildUserPrompt(noteData: CurrentNote, folderProfiles: FolderProfile[], userContext: string = ""): string {
    let template = this.getUserPromptTemplate();

    const vaultStructure = folderProfiles.map(fp =>
      `Folder: "${fp.folderPath}"
  Description: ${fp.description}
  Files: ${fp.fileCount}
  Examples: ${fp.examples.join(', ')}
  Folder Note: ${fp.folderNote?.description || 'None'}`
    ).join('\n\n');

    return template
      .replace("{{noteTitle}}", noteData.title || "Untitled")
      .replace("{{tags}}", (noteData.tags || []).join(", "))
      .replace("{{contentPreview}}", noteData.contentPreview || "")
      .replace("{{vaultStructure}}", vaultStructure)
      .replace("{{userContext}}", userContext);
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
