import { App, TFile } from 'obsidian';
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

  constructor(private app: App, private settings: PluginSettings) {
    this.openaiAdapter = new OpenAIAdapter(settings);
  }

  async recommendFolder(
    noteData: CurrentNote,
    folderProfiles: FolderProfile[],
    userContext: string = "",
    currentFileEmbedding?: number[]
  ): Promise<RecommendationResult> {
    console.log('[LLM] Getting recommendation with context:', userContext.substring(0, 50) + '...');
    const startTime = Date.now();

    // Create system prompt
    const systemPrompt = this.getSystemPrompt();

    // Create user prompt
    const userPrompt = this.buildUserPrompt(noteData, folderProfiles, userContext);

    console.log('[LLM] User prompt with context:');
    console.log(userPrompt.substring(0, 200));

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
    console.log('[LLM] Got ' + (result.primaryRecommendation ? '1' : '0') + ' primary recommendation from LLM');

    // Enhance with embedding scores if available
    if (currentFileEmbedding && currentFileEmbedding.length > 0) {
        console.log('[LLM] Enhancing recommendations with embeddings...');
        await this.scoreRecommendationsWithEmbeddings(result, currentFileEmbedding, folderProfiles);
    }

    result.analysisMetadata.processingTime = Date.now() - startTime;
    result.analysisMetadata.tokensUsed = response.tokensUsed;

    return result;
  }

  // Blend LLM confidence with embedding similarity
  blendConfidenceScores(llmConfidence: number, similarity: number, coherence: number): number {
    // Coherence acts as weight: higher coherence = trust embeddings more
    const embedWeight = coherence;
    const llmWeight = 1 - coherence;

    const blended = (llmConfidence * llmWeight) + (similarity * embedWeight);

    // Clamp to 0-1
    return Math.max(0, Math.min(1, blended));
  }

  // Score recommendations using embeddings
  async scoreRecommendationsWithEmbeddings(recommendations: RecommendationResult, currentFileEmbedding: number[], folderProfiles: FolderProfile[]) {
    console.log(`[SIMILARITY] Starting similarity scoring...`);
    console.log(`[SIMILARITY] File embedding dimensions: ${currentFileEmbedding?.length || 'null'}`);
    if (!currentFileEmbedding || !folderProfiles) {
      return recommendations;
    }

    const processRec = (rec: FolderRecommendation) => {
        try {
            const folderData = folderProfiles.find(f => f.folderPath === rec.folderPath);
            console.log(`[SIMILARITY] Scoring folder: ${rec.folderPath}`);

            if (!folderData) {
                console.log(`[SIMILARITY] No folder data for ${rec.folderPath}`);
                rec.similarity = 0.5; // Default if no centroid
                rec.enhancedConfidence = rec.confidence;
                return;
            }

            if (!folderData.hasValidCentroid || !folderData.folderCentroid) {
                console.log(`[SIMILARITY] No valid centroid for ${rec.folderPath}`);
                rec.similarity = 0.5; // Default if no centroid
                rec.enhancedConfidence = rec.confidence;
                return;
            }

            // Calculate cosine similarity to folder centroid
            const similarity = this.cosineSimilarity(
                currentFileEmbedding,
                folderData.folderCentroid
            );

            console.log(`[SIMILARITY] ${rec.folderPath}: similarity=${(similarity * 100).toFixed(1)}%, coherence=${(folderData.coherenceScore * 100).toFixed(1)}%`);

            rec.similarity = similarity;

            // Blend confidence with similarity using coherence as weight
            const coherence = folderData.coherenceScore || 0.5;
            // Convert confidence to 0-1 for blending
            const llmConf = rec.confidence / 100;

            const blended = this.blendConfidenceScores(
                llmConf,
                similarity,
                coherence
            );

            rec.enhancedConfidence = Math.round(blended * 100);
            console.log(`[SIMILARITY] ${rec.folderPath}: LLM=${(rec.confidence).toFixed(1)}% → Enhanced=${(rec.enhancedConfidence).toFixed(1)}%`);

        } catch (error) {
            // @ts-ignore
            console.error(`[SIMILARITY] Error scoring ${rec.folderPath}:`, error.message);
            rec.similarity = 0.5;
            rec.enhancedConfidence = rec.confidence;
        }
    }

    if (recommendations.primaryRecommendation) {
        processRec(recommendations.primaryRecommendation);
    }

    if (recommendations.alternatives) {
        recommendations.alternatives.forEach(processRec);
    }

    return recommendations;
  }

  // Cosine similarity between two vectors
  cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (!vec1 || !vec2 || vec1.length !== vec2.length) {
      return 0;
    }

    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      const v1 = vec1[i] || 0;
      const v2 = vec2[i] || 0;
      dotProduct += v1 * v2;
      mag1 += v1 * v1;
      mag2 += v2 * v2;
    }

    mag1 = Math.sqrt(mag1);
    mag2 = Math.sqrt(mag2);

    if (mag1 === 0 || mag2 === 0) {
      return 0;
    }

    return dotProduct / (mag1 * mag2);
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

  async generateFolderNames(file: TFile, userContext: string, topFolders: FolderRecommendation[] = []): Promise<any> {
    console.log('[FOLDERGEN] Generating folder names...');
    try {
      const fileContent = await this.app.vault.read(file);
      const topFoldersList = topFolders
        .slice(0, 3)
        .map(f => f.folderPath || f.folderName)
        .join(', ');

      // Find potential parent folders based on top recommendations
      let parentFolderSuggestions = 'None';
      if (topFolders.length > 0) {
        console.log('[FOLDERGEN] Top folders available as parents:', topFoldersList);
        parentFolderSuggestions = topFoldersList;
      }

      const prompt = `Based on this file content and user context, suggest ONE primary folder name and UP TO TWO alternative parent folders where it could be organized.

File: ${file.name}
Content preview: ${fileContent.substring(0, 500)}...
User context: ${userContext || 'None provided'}
Top recommended folders: ${parentFolderSuggestions}

Requirements:
1. Primary name should be 1-3 words
2. Should reflect the file content
3. Should follow existing vault naming conventions (PascalCase)
4. Consider if it should be a subfolder under one of the recommended folders
5. Return ONLY a JSON object with this structure (no other text):

{
  "primaryName": "SuggestedFolderName",
  "suggestedParentFolders": ["ParentFolder1", "ParentFolder2"],
  "reasoning": "Brief explanation of why this name and location"
}`;

      const messages: ChatMessage[] = [{ role: 'user', content: prompt }];

      const response = await this.openaiAdapter.call(messages, {
          model: this.settings.openaiModel, // Use configured model
          temperature: 0.7,
          maxTokens: 500
      });
      console.log('[FOLDERGEN] Raw response:', response.content);

      // Parse JSON response - handle both plain object and wrapped object
      let parsed;
      try {
        // First try direct parse
        parsed = JSON.parse(response.content);
      } catch (e) {
        // Try to extract JSON from response
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      }

      // Handle different response formats
      // @ts-ignore
      if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
        // Old format - just convert to new format
        console.log('[FOLDERGEN] Got legacy format, converting...');
        return {
          // @ts-ignore
          primaryName: parsed.suggestions[0] || 'NewFolder',
          suggestedParentFolders: [],
          reasoning: 'Generated from file content'
        };
      }

      // New format
      console.log('[FOLDERGEN] Generated suggestion:', parsed.primaryName);
      console.log('[FOLDERGEN] Suggested parents:', parsed.suggestedParentFolders);

      return {
        primaryName: parsed.primaryName || 'NewFolder',
        suggestedParentFolders: Array.isArray(parsed.suggestedParentFolders) ?
          parsed.suggestedParentFolders : [],
        reasoning: parsed.reasoning || ''
      };

    } catch (error) {
      console.error('Error generating folder names:', error);
      return {
        primaryName: 'NewFolder',
        suggestedParentFolders: [],
        reasoning: 'Error generating suggestions'
      };
    }
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
    console.log('[PARSE] Parsing recommendation response...');
    try {
      const json = JSON.parse(content) as {
          primaryRecommendation: {
              folderPath: string;
              folderName?: string;
              folder?: string;
              confidence: number;
              reasoning: string;
              matchedTopics?: string[];
          };
          alternatives?: Array<{
              folderPath: string;
              folderName?: string;
              folder?: string;
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
      console.log('[PARSE] Primary recommendation folder:', primaryRec.folderPath);

      return {
        primaryRecommendation: {
          folderPath: primaryRec.folderPath || primaryRec.folder || primaryRec.folderName || '',
          folderName: primaryFolder?.folderName || primaryRec.folderName || primaryRec.folderPath,
          confidence: primaryRec.confidence,
          reasoning: primaryRec.reasoning,
          matchedTopics: primaryRec.matchedTopics || [],
          matchStrength: primaryRec.confidence > 80 ? 'strong' :
                        primaryRec.confidence > 60 ? 'moderate' : 'weak'
        },
        alternatives: (json.alternatives || []).map((alt, index) => {
            console.log('[PARSE] Alternative ' + (index + 1) + ' folder:', alt.folderPath);
            return {
              folderPath: alt.folderPath || alt.folder || alt.folderName || '',
              folderName: folderProfiles.find(f => f.folderPath === alt.folderPath)?.folderName || alt.folderName || alt.folderPath,
              confidence: alt.confidence,
              reasoning: alt.reasoning,
              matchedTopics: alt.matchedTopics || [],
              matchStrength: 'moderate' as const
            };
        }),
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
