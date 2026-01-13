import { App, Modal, TFile, ButtonComponent, TextAreaComponent } from 'obsidian';
import { RecommendationResult, FolderRecommendation, CurrentNote, FolderProfile, PluginSettings } from '../models/types';
import { LLMCoordinator } from '../services/LLMCoordinator';
import { VaultScanner } from '../services/VaultScanner';

export class RecommendationModal extends Modal {
  private phase: 'input' | 'select' = 'input';
  private userContext: string = "";
  private recommendation: RecommendationResult | null = null;
  private allFolders: { name: string; path: string; level: number }[] = [];

  constructor(
    app: App,
    private noteData: CurrentNote,
    private vaultStructure: FolderProfile[],
    private llmCoordinator: LLMCoordinator,
    private vaultScanner: VaultScanner,
    private settings: PluginSettings,
    private currentFile: TFile,
    private onAction: (action: 'move' | 'preview' | 'cancel', targetPath?: string) => void
  ) {
    super(app);
    // Pre-fetch all folders for search
    if (this.settings.showManualFolderSearch) {
        this.allFolders = this.vaultScanner.getAllFolders();
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    if (this.phase === 'input') {
      this.showInputStep(contentEl);
    } else {
      this.showSelectStep(contentEl);
    }
  }

  private showInputStep(containerEl: HTMLElement) {
    containerEl.createEl('h2', { text: 'File Classification' });
    containerEl.createEl('p', { text: `File: ${this.currentFile.basename}` });

    containerEl.createEl('h3', { text: 'Add context (optional)' });
    const ta = new TextAreaComponent(containerEl);
    ta.setPlaceholder("e.g., 'This is a technical article about neural networks', 'This is personal notes for a project'");
    ta.setValue(this.userContext);
    ta.onChange((value) => {
        this.userContext = value;
    });
    ta.inputEl.rows = 6;
    ta.inputEl.addClass('context-input');
    ta.inputEl.style.width = '100%';

    const buttonDiv = containerEl.createDiv('modal-buttons');
    buttonDiv.style.marginTop = '20px';
    buttonDiv.style.display = 'flex';
    buttonDiv.style.gap = '10px';

    new ButtonComponent(buttonDiv)
        .setButtonText('Get Recommendations')
        .setCta()
        .onClick(async () => {
            await this.processAndShowRecommendations();
        });

    new ButtonComponent(buttonDiv)
        .setButtonText('Cancel')
        .onClick(() => {
            this.onAction('cancel');
            this.close();
        });
  }

  private async processAndShowRecommendations() {
    try {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('p', { text: 'Analyzing and getting recommendations...' });

        this.recommendation = await this.llmCoordinator.recommendFolder(
            this.noteData,
            this.vaultStructure,
            this.userContext
        );

        this.phase = 'select';
        this.onOpen();
    } catch (error) {
        this.contentEl.empty();
        this.contentEl.createEl('h2', { text: 'Error' });
        // @ts-ignore
        this.contentEl.createEl('p', { text: error.message, cls: 'error-text' });
        new ButtonComponent(this.contentEl)
            .setButtonText('Close')
            .onClick(() => this.close());
    }
  }

  private showSelectStep(containerEl: HTMLElement) {
    containerEl.createEl('h2', { text: 'Recommended Folders' });

    if (!this.recommendation) return;

    // Primary
    this.renderRecommendation(
      containerEl,
      this.recommendation.primaryRecommendation,
      true
    );

    // Alternatives
    if (this.recommendation.alternatives.length > 0) {
        containerEl.createEl('h3', { text: 'Alternatives' });
        this.recommendation.alternatives.forEach(alt => {
            this.renderRecommendation(containerEl, alt, false);
        });
    }

    // Manual Search
    if (this.settings.showManualFolderSearch) {
        containerEl.createEl('hr');
        containerEl.createEl('h3', { text: 'Or select another folder:' });
        this.renderFolderSearch(containerEl);
    }

    // Actions
    const actionDiv = containerEl.createDiv('modal-actions');
    actionDiv.style.marginTop = '20px';
    actionDiv.style.display = 'flex';
    actionDiv.style.gap = '10px';
    actionDiv.style.justifyContent = 'flex-end';

    new ButtonComponent(actionDiv)
        .setButtonText('← Back')
        .onClick(() => {
            this.phase = 'input';
            this.onOpen();
        });

    new ButtonComponent(actionDiv)
        .setButtonText('Cancel')
        .onClick(() => {
            this.onAction('cancel');
            this.close();
        });
  }

  private renderRecommendation(container: HTMLElement, rec: FolderRecommendation, isPrimary: boolean) {
    const div = container.createDiv({
      cls: isPrimary ? 'recommendation-primary' : 'recommendation-alt'
    });

    div.createEl('h4', { text: `📁 ${rec.folderName}` });

    const confidenceColor = rec.confidence > 80 ? 'confidence-green' :
                           rec.confidence > 60 ? 'confidence-yellow' : 'confidence-red';
    div.createEl('p', {
      text: `Confidence: ${rec.confidence}%`,
      cls: confidenceColor
    });

    if (rec.reasoning) {
        div.createEl('p', { text: `Reason: ${rec.reasoning}` });
    }

    const btn = new ButtonComponent(div)
        .setButtonText('Select This Folder');

    if (isPrimary) {
        btn.setCta();
    }

    btn.onClick(() => {
        this.onAction('move', rec.folderPath);
        this.close();
    });
  }

  private renderFolderSearch(containerEl: HTMLElement) {
      const searchInput = containerEl.createEl('input', {
          type: 'text',
          cls: 'folder-search-input',
          placeholder: 'Search folders...'
      });
      searchInput.style.width = '100%';
      searchInput.style.marginBottom = '10px';

      const listContainer = containerEl.createDiv('folder-list-container');

      let filteredFolders = this.allFolders;

      const renderList = (folders: typeof this.allFolders) => {
          listContainer.empty();
          if (folders.length === 0) {
              listContainer.createEl('p', { text: 'No folders found' });
              return;
          }

          // Limit to 50 items for performance if search is empty
          const displayFolders = folders.slice(0, 50);

          for (const folder of displayFolders) {
              const item = listContainer.createDiv('folder-item');

              const nameSpan = item.createEl('span');
              nameSpan.style.paddingLeft = `${folder.level * 15}px`;
              nameSpan.textContent = `📁 ${folder.name}`;

              new ButtonComponent(item)
                  .setButtonText('Select')
                  .setClass('button-small')
                  .onClick(() => {
                      this.onAction('move', folder.path);
                      this.close();
                  });
          }
          if (folders.length > 50) {
              listContainer.createEl('p', { text: `...and ${folders.length - 50} more. Type to search.` });
          }
      };

      searchInput.addEventListener('input', (e) => {
          const query = (e.target as HTMLInputElement).value.toLowerCase();
          if (!query) {
              filteredFolders = this.allFolders;
          } else {
              filteredFolders = this.allFolders.filter(f => f.path.toLowerCase().includes(query));
          }
          renderList(filteredFolders);
      });

      renderList(filteredFolders);
  }

  onClose() {
    this.contentEl.empty();
  }
}
