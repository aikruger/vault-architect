import { App, TFile } from 'obsidian';
import { Vector } from '../models/types';

export class SmartConnectionsService {
    app: App;
    private pluginId = 'smart-connections';

    constructor(app: App) {
        this.app = app;
    }

    isAvailable(): boolean {
        // @ts-ignore
        return !!this.app.plugins.getPlugin(this.pluginId);
    }

    private getPlugin(): any {
        // @ts-ignore
        return this.app.plugins.getPlugin(this.pluginId);
    }

    async getEmbedding(text: string): Promise<Vector | null> {
        if (!this.isAvailable()) return null;

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
         if (!this.isAvailable()) return null;

         const plugin = this.getPlugin();

         try {
             if (plugin && plugin.api && typeof plugin.api.getNoteEmbedding === 'function') {
                 return await plugin.api.getNoteEmbedding(file);
             }
         } catch(e) {
             console.error("Error fetching note embedding from Smart Connections:", e as Error);
         }
         return null;
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

            // Step 4: If API not found, try to get embeddings directly
            if (!api && scPlugin.settings) {
                console.log('[SC DEBUG] API not available, checking embeddings database...');
                const hasEmbeddings = scPlugin.settings.embeddings_folder &&
                    this.app.vault.getAbstractFileByPath(scPlugin.settings.embeddings_folder);
                console.log('[SC DEBUG] Has embeddings folder:', !!hasEmbeddings);
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

            return {
                connected: !!api,
                features: api ? [
                    'Centroid Similarity Scoring',
                    'Coherence-Weighted Blending',
                    'Folder Centroid Calculation'
                ] : [],
                message: api ? 'Smart Connections connected' : 'API not accessible'
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
