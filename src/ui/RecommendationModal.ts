import { App, Modal, TFile, ButtonComponent } from 'obsidian';
import { RecommendationResult, FolderRecommendation } from '../models/types';

export class RecommendationModal extends Modal {
  constructor(
    app: App,
    private recommendation: RecommendationResult,
    private currentFile: TFile,
    private onAction: (action: 'move' | 'preview' | 'cancel', targetPath?: string) => void
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;

    // Header
    contentEl.createEl('h2', { text: 'Folder Recommendation' });
    contentEl.createEl('p', {
      text: `File: ${this.currentFile.basename}`
    });

    // Primary recommendation
    this.renderRecommendation(
      contentEl,
      this.recommendation.primaryRecommendation,
      true
    );

    // Divider
    contentEl.createEl('hr');

    // Alternatives
    contentEl.createEl('h3', { text: 'Alternatives' });
    this.recommendation.alternatives.forEach(alt => {
      this.renderRecommendation(contentEl, alt, false);
    });

    // Buttons
    const buttonContainer = contentEl.createEl('div', { cls: 'button-container' });

    new ButtonComponent(buttonContainer)
      .setButtonText('📁 Move Here')
      .setCta()
      .onClick(() => {
        this.onAction('move', this.recommendation.primaryRecommendation.folderPath);
        this.close();
      });

    new ButtonComponent(buttonContainer)
        .setButtonText('Preview')
        .onClick(() => {
             this.onAction('preview');
        });

    new ButtonComponent(buttonContainer)
        .setButtonText('Cancel')
        .onClick(() => {
             this.onAction('cancel');
             this.close();
        });
  }

  private renderRecommendation(container: HTMLElement, rec: FolderRecommendation, isPrimary: boolean) {
    const div = container.createEl('div');
    div.addClass(isPrimary ? 'recommendation-primary' : 'recommendation-alt');

    div.createEl('h4', {
      text: `📁 ${rec.folderName}`
    });

    const confidenceColor = rec.confidence > 80 ? 'green' :
                           rec.confidence > 60 ? 'yellow' : 'red';
    div.createEl('p', {
      text: `Confidence: ${rec.confidence}%`,
      cls: `confidence-${confidenceColor}`
    });

    div.createEl('p', { text: `Reasoning: ${rec.reasoning}` });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
