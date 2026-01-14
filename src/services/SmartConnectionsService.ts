import { App, TFile, TFolder } from 'obsidian';
import { Vector } from '../models/types';

class EmbeddingsCache {
    private vectors: Record<string, number[]> | null = null;
    private lastLoadTime: number | null = null;
    public cacheValid = false;

    constructor(private app: App) {}

    async loadVectors(): Promise<boolean> {
        try {
            const vectorsFile = this.app.vault.getAbstractFileByPath('.smart-env/vectors.json');

            if (!vectorsFile) {
                console.warn('vectors.json not found');
                return false;
            }

            // @ts-ignore
            const content = await this.app.vault.read(vectorsFile);
            this.vectors = JSON.parse(content);
            this.lastLoadTime = Date.now();
            this.cacheValid = true;

            const count = Object.keys(this.vectors || {}).length;
            console.log(`[SC DEBUG] ✅ Loaded ${count} embeddings from vectors.json`);

            return true;
        } catch (error) {
            console.error('[SC DEBUG] Failed to load vectors.json:', error);
            this.cacheValid = false;
            return false;
        }
    }

    getEmbedding(filePath: string): number[] | null {
        if (!this.cacheValid || !this.vectors) {
            // Try explicit load if invalid
            return null;
        }

        const embedding = this.vectors![filePath];

        if (!embedding) {
            // console.warn(`No embedding found for: ${filePath}`);
            return null;
        }

        return Array.isArray(embedding) ? embedding : null;
    }

    isCacheValid(): boolean {
        // Invalidate cache after 5 minutes
        if (!this.lastLoadTime) return false;
        return this.cacheValid && (Date.now() - this.lastLoadTime) < (5 * 60 * 1000);
    }
}

export class SmartConnectionsService {
    app: App;
    private pluginId = 'smart-connections';
    private embeddingsCache: EmbeddingsCache;
    private folderCentroids: Map<string, number[]> = new Map();

    constructor(app: App) {
        this.app = app;
        this.embeddingsCache = new EmbeddingsCache(app);
    }

    isAvailable(): boolean {
        // @ts-ignore
        const plugin = this.app.plugins.getPlugin(this.pluginId);
        // Also consider available if we have cached vectors
        return !!plugin || this.embeddingsCache.cacheValid;
    }

    private getPlugin(): any {
        // @ts-ignore
        return this.app.plugins.getPlugin(this.pluginId);
    }

    async getEmbedding(text: string): Promise<Vector | null> {
        // Text embedding still needs the API if possible
        const plugin = this.getPlugin();
        try {
             if (plugin && plugin.api && typeof plugin.api.getEmbedding === 'function') {
                return await plugin.api.getEmbedding(text);
             }
        } catch (e) {
            console.error("Error fetching embedding from Smart Connections:", e);
        }
        return null;
    }

    async getNoteEmbedding(file: TFile): Promise<Vector | null> {
         // 1. Try API first
         const plugin = this.getPlugin();
         try {
             if (plugin && plugin.api && typeof plugin.api.getNoteEmbedding === 'function') {
                 const emb = await plugin.api.getNoteEmbedding(file);
                 if (emb) return emb;
             }
         } catch(e) {
             // Continue to fallback
         }

         // 2. Fallback to cache
         if (!this.embeddingsCache.isCacheValid()) {
             await this.embeddingsCache.loadVectors();
         }
         return this.embeddingsCache.getEmbedding(file.path);
    }

    async calculateFolderCentroid(folder: TFolder, files: TFile[]): Promise<number[] | null> {
        if (!this.isAvailable()) return null;

        // Check cache first
        if (this.folderCentroids.has(folder.path)) {
            return this.folderCentroids.get(folder.path)!;
        }

        const embeddings: number[][] = [];

        // Get embeddings for all files in folder
        for (const file of files) {
            const embedding = await this.getNoteEmbedding(file);
            if (embedding && Array.isArray(embedding)) {
                embeddings.push(embedding);
            }
        }

        if (embeddings.length === 0) {
            // console.warn(`No embeddings found for folder: ${folder.path}`);
            return null;
        }

        // Calculate centroid (average)
        const dimension = embeddings[0].length;
        const centroid = new Array(dimension).fill(0);

        for (const embedding of embeddings) {
            for (let i = 0; i < dimension; i++) {
                centroid[i] += (embedding[i] || 0);
            }
        }

        for (let i = 0; i < dimension; i++) {
            centroid[i] /= embeddings.length;
        }

        console.log(`[SC DEBUG] ✅ Calculated centroid for ${folder.path} (${embeddings.length} notes)`);
        this.folderCentroids.set(folder.path, centroid);
        return centroid;
    }

    async calculateCoherence(files: TFile[]): Promise<number> {
        if (!this.isAvailable() || files.length < 2) return 0.7;

        try {
            const embeddings: Vector[] = [];
            for (const file of files) {
                const emb = await this.getNoteEmbedding(file);
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
            console.error("Coherence calculation failed", e as Error);
            return 0.7;
        }
    }

    private cosineSimilarity(a: Vector, b: Vector): number {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            const valA = a[i] || 0;
            const valB = b[i] || 0;
            dotProduct += valA * valB;
            normA += valA * valA;
            normB += valB * valB;
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    async getConnectionStatus() {
        console.log('[SC DEBUG] Starting connection status check...');

        try {
            // Step 1: Check if plugin exists
            console.log('[SC DEBUG] Looking for smart-connections plugin...');
            // @ts-ignore
            const scPlugin = this.app.plugins.getPlugin('smart-connections');
            console.log('[SC DEBUG] Smart Connections plugin found:', !!scPlugin);

            if (!scPlugin) {
                // @ts-ignore
                console.log('[SC DEBUG] Plugin not found. Installed plugins:', Array.from(this.app.plugins.plugins.keys()));
                return {
                    connected: false,
                    features: [],
                    message: 'Smart Connections plugin not installed'
                };
            }

            // Step 2: Check if plugin is enabled
            console.log('[SC DEBUG] Plugin loaded:', scPlugin.loaded);
            if (!scPlugin.loaded) {
                console.log('[SC DEBUG] Plugin exists but not loaded');
                return {
                    connected: false,
                    features: [],
                    message: 'Smart Connections plugin not enabled'
                };
            }

            // Step 3: Check if API exists
            console.log('[SC DEBUG] Checking for API...');
            console.log('[SC DEBUG] Plugin object keys:', Object.keys(scPlugin).slice(0, 20));

            // Try multiple API access patterns
            // @ts-ignore
            let api = scPlugin.api || scPlugin.smartConnectionsApi || window.SmartConnectionsApi;
            console.log('[SC DEBUG] API found via direct access:', !!api);

            // Step 4: If API not found, try to get embeddings directly via cache
            let directAccess = false;
            if (!api) {
                console.log('[SC DEBUG] API not available, checking vectors.json...');
                directAccess = await this.embeddingsCache.loadVectors();
                console.log('[SC DEBUG] Direct vectors.json access:', directAccess);
            }

            // Step 5: Test with vault root
            if (api) {
                console.log('[SC DEBUG] Testing API with vault root...');
                const rootFile = this.app.vault.getRoot();

                // Test getNoteEmbedding
                if (typeof api.getNoteEmbedding === 'function') {
                    console.log('[SC DEBUG] getNoteEmbedding function available');
                    const testEmb = await Promise.race([
                        api.getNoteEmbedding(rootFile),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('API timeout')), 5000)
                        )
                    ]);
                    // @ts-ignore
                    console.log('[SC DEBUG] Test embedding received:', !!testEmb, 'dimensions:', testEmb?.length);
                } else {
                    console.log('[SC DEBUG] getNoteEmbedding not a function');
                    console.log('[SC DEBUG] API methods available:', Object.keys(api).slice(0, 10));
                }
            }

            const isConnected = !!api || directAccess;
            const message = !!api ? 'Smart Connections connected (API)' :
                           directAccess ? 'Smart Connections connected (Direct Read)' : 'API/DB not accessible';

            return {
                connected: isConnected,
                features: isConnected ? [
                    'Centroid Similarity Scoring',
                    'Coherence-Weighted Blending',
                    'Folder Centroid Calculation'
                ] : [],
                message: message
            };

        } catch (error) {
            // @ts-ignore
            console.error('[SC DEBUG] Connection check error:', error.message);
            // @ts-ignore
            console.error('[SC DEBUG] Error stack:', error.stack);
            return {
                connected: false,
                features: [],
                // @ts-ignore
                message: 'Error: ' + error.message
            };
        }
    }
}
