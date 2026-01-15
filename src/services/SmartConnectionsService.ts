import { App, TFile, TFolder } from 'obsidian';
import { Vector } from '../models/types';

/**
 * Parse .ajson files which contain multiple embedded JSON objects
 * Format: "smart_sources:path": {...} followed by "smart_blocks:path#section": {...}
 */
function parseAjsonFile(content: string): Record<string, any> {
  const result: Record<string, any> = {};

  // Find all "smart_sources:..." and "smart_blocks:..." patterns
  const keyRegex = /"(smart_sources|smart_blocks):[^"]+"/g;

  let match;
  while ((match = keyRegex.exec(content)) !== null) {
    const key = match[0].slice(1, -1); // Remove surrounding quotes
    const startPos = match.index;

    // Find the matching JSON value object {...}
    let braceCount = 0;
    let valueStart = -1;
    let valueEnd = -1;
    let inString = false;
    let escapeNext = false;

    // Scan forward from the key to find the complete object
    for (let i = startPos; i < content.length; i++) {
      const char = content[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      // Track string boundaries to avoid counting braces inside strings
      if (char === '"' && !inString) {
        inString = true;
      } else if (char === '"' && inString) {
        inString = false;
      }

      // Count braces only outside of strings
      if (!inString) {
        if (char === '{') {
          if (valueStart === -1) valueStart = i;
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0 && valueStart !== -1) {
            valueEnd = i + 1;
            break;
          }
        }
      }
    }

    // Extract and parse the JSON object
    if (valueStart !== -1 && valueEnd !== -1) {
      const value = content.substring(valueStart, valueEnd);
      try {
        result[key] = JSON.parse(value);
      } catch (error) {
        console.warn(`[SC] Failed to parse key ${key}:`, error);
      }
    }
  }

  return result;
}

export class SmartConnectionsService {
  app: App;
  private ajsonCache = new Map<string, any>();           // Cache for loaded .ajson files
  private folderCentroids = new Map<string, number[]>(); // Cache for folder centroids
  private isAvailable = false;                           // Whether SC is usable
  private embeddingModel = 'TaylorAI/bge-micro-v2';      // The model SC uses

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Initialize the service
   * Checks if Smart Connections plugin is installed and .smart-env/multi exists
   */
  async initialize() {
    // @ts-ignore
    const scPlugin = this.app.plugins.getPlugin('smart-connections');

    if (!scPlugin) {
      console.log('[SC] Smart Connections not installed');
      this.isAvailable = false;
      return;
    }

    // Check if .smart-env/multi folder exists
    try {
      const multiFolder = await this.app.vault.adapter.list('.smart-env/multi');
      if (multiFolder && multiFolder.files.length > 0) {
        console.log(`[SC] ✅ Smart Connections initialized (${multiFolder.files.length} embedding files)`);
        this.isAvailable = true;
      } else {
        console.warn('[SC] .smart-env/multi folder not found');
        this.isAvailable = false;
      }
    } catch (error) {
      console.error('[SC] Error checking embeddings:', error);
      this.isAvailable = false;
    }
  }

  /**
   * Convert a file path to its corresponding .ajson filename
   * Example: "1_KM Repository/1_KM Repository.md" → "1_KM_Repository_1_KM_Repository_md.ajson"
   */
  pathToAjsonFileName(filePath: string): string {
    const encoded = filePath
      .replace(/\//g, '_')   // Replace forward slashes with underscore
      .replace(/\./g, '_')   // Replace dots with underscore
      .replace(/ /g, '_');   // Replace spaces with underscore

    return `${encoded}.ajson`;
  }

  /**
   * Load a .ajson file and parse its embedded JSON objects
   * Uses cache to avoid re-reading the same file
   */
  async loadAjsonFile(ajsonFileName: string): Promise<any> {
    // Check cache first
    if (this.ajsonCache.has(ajsonFileName)) {
      return this.ajsonCache.get(ajsonFileName);
    }

    try {
      const fullPath = `.smart-env/multi/${ajsonFileName}`;
      const content = await this.app.vault.adapter.read(fullPath);

      // Parse the embedded JSON objects using our custom parser
      const data = parseAjsonFile(content);

      // Cache the result
      this.ajsonCache.set(ajsonFileName, data);

      console.log(`[SC] ✅ Loaded ${Object.keys(data).length} objects from ${ajsonFileName}`);

      return data;
    } catch (error) {
      // @ts-ignore
      console.warn(`[SC] Failed to load ${ajsonFileName}:`, error.message);
      return null;
    }
  }

  /**
   * Extract the embedding vector from parsed .ajson data
   * Navigates: embeddings → {modelName} → vec
   */
  extractEmbeddingFromAjson(ajsonData: any, filePath: string): number[] | null {
    if (!ajsonData) {
      return null;
    }

    // The key format is "smart_sources:{filePath}"
    const key = `smart_sources:${filePath}`;
    const fileData = ajsonData[key];

    if (!fileData) {
      console.warn(`[SC] Key not found: ${key}`);
      return null;
    }

    // Navigate through the nested structure
    const embeddings = fileData.embeddings;
    if (!embeddings) {
      return null;
    }

    const modelEmbedding = embeddings[this.embeddingModel];
    if (!modelEmbedding) {
      console.warn(`[SC] No embedding for model ${this.embeddingModel}`);
      return null;
    }

    const vec = modelEmbedding.vec;

    // Verify it's actually an array of numbers
    return Array.isArray(vec) ? vec : null;
  }

  /**
   * Get the embedding vector for a single file
   * Returns a 384-dimensional array or null
   */
  async getFileEmbedding(file: TFile): Promise<number[] | null> {
    if (!this.isAvailable) {
      return null;
    }

    try {
      // Convert file path to .ajson filename
      const ajsonFileName = this.pathToAjsonFileName(file.path);

      // Load the .ajson file
      const ajsonData = await this.loadAjsonFile(ajsonFileName);
      if (!ajsonData) {
        return null;
      }

      // Extract the embedding vector
      const embedding = this.extractEmbeddingFromAjson(ajsonData, file.path);

      if (embedding) {
        console.log(`[SC] ✅ Retrieved embedding for: ${file.path}`);
      }

      return embedding;
    } catch (error) {
      console.error(`[SC] Error getting embedding for ${file.path}:`, error);
      return null;
    }
  }

  /**
   * Compute cosine similarity between two vectors
   * Returns value between -1 and 1 (typically 0 to 1 for normalized embeddings)
   */
  cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
      return 0;
    }

    let dot = 0;
    let magA = 0;
    let magB = 0;

    // Compute dot product and magnitudes
    for (let i = 0; i < vecA.length; i++) {
      const valA = vecA[i] || 0;
      const valB = vecB[i] || 0;
      dot += valA * valB;
      magA += valA * valA;
      magB += valB * valB;
    }

    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);

    // Avoid division by zero
    if (magA === 0 || magB === 0) {
      return 0;
    }

    return dot / (magA * magB);
  }

  /**
   * Calculate the centroid (average embedding) for all files in a folder
   * This represents the "topic center" of the folder
   * Caches the result for performance
   */
  async calculateFolderCentroid(folder: TFolder, files: TFile[]): Promise<number[] | null> {
    if (!this.isAvailable) {
      return null;
    }

    // Check cache first
    if (this.folderCentroids.has(folder.path)) {
      console.log(`[SC] 📦 Using cached centroid for: ${folder.name}`);
      return this.folderCentroids.get(folder.path) || null;
    }

    console.log(`[SC] 🧮 Calculating centroid for: ${folder.name}`);

    const embeddings: number[][] = [];

    // Load embedding for each file in the folder
    for (const file of files) {
      const embedding = await this.getFileEmbedding(file);

      // Only include valid embeddings
      if (embedding && Array.isArray(embedding) && embedding.length > 0) {
        embeddings.push(embedding);
      }
    }

    if (embeddings.length === 0) {
      console.warn(`[SC] ⚠️ No valid embeddings found for ${folder.name}`);
      return null;
    }

    // Calculate centroid by averaging all embeddings
    const dim = embeddings[0]!.length;
    const centroid = new Array(dim).fill(0);

    for (const emb of embeddings) {
      for (let i = 0; i < dim; i++) {
        centroid[i] += (emb[i] || 0);
      }
    }

    // Divide by count to get average
    for (let i = 0; i < dim; i++) {
      centroid[i] /= embeddings.length;
    }

    // Cache it
    this.folderCentroids.set(folder.path, centroid);

    console.log(`[SC] ✅ Centroid ready for ${folder.name} (${embeddings.length}/${files.length} files)`);
    return centroid;
  }

  // Backwards compatibility alias
  async getNoteEmbedding(file: TFile): Promise<number[] | null> {
      return this.getFileEmbedding(file);
  }

  /**
   * Score a recommendation by blending LLM score with embedding similarity
   * Uses folder coherence as the weighting factor
   * Returns detailed breakdown of scoring
   */
  scoreRecommendationWithEmbedding(fileEmbedding: number[], folderCentroid: number[], folderCoherence: number, llmScore: number) {
    if (!fileEmbedding || !folderCentroid) {
      // Fallback to LLM score only
      return {
        original: llmScore,
        enhanced: llmScore,
        similarity: 0,
        coherence: folderCoherence,
        embeddingWeight: 0,
        fallback: true
      };
    }

    // Calculate how similar the file is to the folder topic
    const similarity = this.cosineSimilarity(fileEmbedding, folderCentroid);

    // Weight the scores based on folder coherence
    // Higher coherence = folder is more focused = trust embeddings more
    const embeddingWeight = folderCoherence;
    const llmWeight = 1 - folderCoherence;

    // Blend the scores
    const enhancedScore = (llmScore * llmWeight) + (similarity * embeddingWeight);

    return {
      original: llmScore,                    // Original LLM score (0-1)
      enhanced: enhancedScore,               // Blended score (0-1)
      similarity: similarity,                // Embedding similarity (-1 to 1)
      coherence: folderCoherence,            // Folder coherence (0-1)
      embeddingWeight: embeddingWeight,      // Weight given to embeddings
      fallback: false
    };
  }

  async calculateCoherence(files: TFile[]): Promise<number> {
      if (!this.isAvailable || files.length < 2) return 0.7;

      try {
          const embeddings: Vector[] = [];
          for (const file of files) {
              const emb = await this.getFileEmbedding(file);
              if (emb) embeddings.push(emb);
          }

          if (embeddings.length < 2) return 0.7;

          // Calculate average cosine similarity
          let totalSim = 0;
          let pairs = 0;

          for (let i = 0; i < embeddings.length; i++) {
              for (let j = i + 1; j < embeddings.length; j++) {
                  const vecA = embeddings[i];
                  const vecB = embeddings[j];
                  if (vecA && vecB) {
                      totalSim += this.cosineSimilarity(vecA, vecB);
                      pairs++;
                  }
              }
          }

          return pairs > 0 ? totalSim / pairs : 0.7;
      } catch (e) {
          console.error("Coherence calculation failed", e);
          return 0.7;
      }
  }

  /**
   * Clear all caches (useful for testing or manual refresh)
   */
  clearCache() {
    this.folderCentroids.clear();
    this.ajsonCache.clear();
    console.log('[SC] 🗑️ Cache cleared');
  }

  /**
   * Check if Smart Connections is available and ready
   */
  isSmartConnectionsAvailable() {
    return this.isAvailable;
  }

  // Compatibility for SettingsTab
  async getConnectionStatus() {
      if (this.isAvailable) {
          return {
              connected: true,
              features: ['Centroid Similarity', 'Coherence Blending', '.ajson parsing'],
              message: 'Smart Connections initialized via .ajson'
          };
      }
      return {
          connected: false,
          features: [],
          message: 'Smart Connections not ready'
      };
  }
}
