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
}
