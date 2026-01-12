import { App, TFile, getAllTags } from 'obsidian';
import { CurrentNote, ExtractedNoteData, PluginSettings } from '../models/types';

export class NoteAnalyzer {
  constructor(private app: App, private settings: PluginSettings) {}

  async analyzeNote(file: TFile): Promise<CurrentNote> {
    // Read file content
    const content = await this.app.vault.read(file);

    // Parse frontmatter
    const frontmatter = this.parseFrontmatter(content);
    const titleFromFrontmatter = (frontmatter.title as string) || file.basename;

    // Extract tags
    const fileCache = this.app.metadataCache.getFileCache(file);
    const tags = fileCache ? getAllTags(fileCache) || [] : [];

    // Extract headings
    const headings = this.extractHeadings(content);

    // Extract content preview
    const contentWithoutFrontmatter = this.removeFrontmatter(content);
    const contentPreview = this.getContentPreview(
      contentWithoutFrontmatter,
      this.settings.contentPreviewLength
    );

    // Extract links
    const links = fileCache?.links?.map(l => l.link) || [];

    return {
      title: titleFromFrontmatter,
      tags,
      frontmatter,
      content: this.settings.includeFullContent ? contentWithoutFrontmatter : contentPreview,
      contentPreview,
      headings,
      links
    };
  }

  async extractNoteData(note: CurrentNote): Promise<ExtractedNoteData> {
    // Use LLM to extract semantic information from note
    // This would be called by LLMCoordinator

    // Extract key topics from content
    const keyTopics = this.extractKeyTopics(note.content, note.tags);

    // Determine content type
    const contentType = this.inferContentType(note);

    // Create semantic signature
    const semanticSignature = {
      primaryTheme: this.extractPrimaryTheme(note),
      secondaryThemes: this.extractSecondaryThemes(note),
      keywords: keyTopics
    };

    return {
      title: note.title,
      tags: note.tags,
      keyTopics,
      contentType,
      semanticSignature
    };
  }

  // ============================================
  // PRIVATE HELPER METHODS
  // ============================================

  private parseFrontmatter(content: string): Record<string, unknown> {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
    const match = content.match(frontmatterRegex);

    if (!match || !match[1]) return {};

    const frontmatterText = match[1];
    const frontmatter: Record<string, unknown> = {};

    // Simple YAML parsing (consider using proper yaml library for production)
    frontmatterText.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split(':');
      if (key) {
        frontmatter[key.trim()] = valueParts.join(':').trim();
      }
    });

    return frontmatter;
  }

  private removeFrontmatter(content: string): string {
    return content.replace(/^---\n[\s\S]*?\n---\n/, '');
  }

  private extractHeadings(content: string): string[] {
    const headingRegex = /^#{1,6}\s+(.+)$/gm;
    const headings: string[] = [];
    let match;

    while ((match = headingRegex.exec(content)) !== null) {
      if (match[1]) {
          headings.push(match[1]);
      }
    }

    return headings;
  }

  private getContentPreview(content: string, length: number): string {
    // Remove markdown formatting for preview
    const cleaned = content
      .replace(/#+\s/g, '')           // Remove headings
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // Remove link URLs
      .replace(/[*_`]/g, '')          // Remove formatting
      .trim();

    return cleaned.substring(0, length) + (cleaned.length > length ? '...' : '');
  }

  private extractKeyTopics(content: string, tags: string[]): string[] {
    // Simple keyword extraction (production would use NLP)
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at',
      'is', 'are', 'was', 'were', 'be', 'been', 'being'
    ]);

    const words = content
      .toLowerCase()
      .match(/\b[a-z]{4,}\b/g) || [];

    const frequency = new Map<string, number>();

    words.forEach(word => {
      if (!stopWords.has(word)) {
        frequency.set(word, (frequency.get(word) || 0) + 1);
      }
    });

    // Sort by frequency and take top 10
    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word)
      .concat(tags.map(tag => tag.replace('#', '')));
  }

  private inferContentType(note: CurrentNote): 'essay' | 'research' | 'project' | 'resource' | 'personal' {
    // Heuristic: check frontmatter, tags, content patterns
    const contentLower = note.content.toLowerCase();
    const titleLower = note.title.toLowerCase();

    if (note.tags.includes('#research') || contentLower.includes('abstract')) {
      return 'research';
    }
    if (note.tags.includes('#project') || titleLower.includes('project')) {
      return 'project';
    }
    if (note.tags.includes('#resource') || contentLower.includes('reference')) {
      return 'resource';
    }
    if (note.tags.includes('#personal')) {
      return 'personal';
    }

    return 'essay';  // default
  }

  private extractPrimaryTheme(note: CurrentNote): string {
    // Use first tag or first heading as primary theme
    if (note.tags.length > 0 && note.tags[0]) {
      return note.tags[0].replace(/^#+/, '');
    }
    if (note.headings.length > 0 && note.headings[0]) {
      return note.headings[0];
    }
    return 'General';
  }

  private extractSecondaryThemes(note: CurrentNote): string[] {
    // Use subsequent tags and headings
    const tags = note.tags.slice(1, 3).map(t => t ? t.replace(/^#+/, '') : '').filter(t => t.length > 0);
    const headings = note.headings.slice(1, 2).filter(h => !!h);
    return [...tags, ...headings];
  }
}
