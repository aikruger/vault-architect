import { App, Modal, TFile, ButtonComponent, TextAreaComponent, Notice } from 'obsidian';
import { RecommendationResult, FolderRecommendation, FolderProfile } from '../models/types';
import VaultArchitectPlugin from '../main';

export class RecommendationModalV2 extends Modal {
  private phase: 'input' | 'select' = 'input';
  private userContext: string = "";
  private recommendation: RecommendationResult | null = null;
  private allFolders: { name: string; path: string; level: number }[] = [];
  private vaultProfiles: FolderProfile[] = [];

  public currentFile: TFile;
  public currentFileEmbedding: number[] | undefined;

  constructor(
    app: App,
    private plugin: VaultArchitectPlugin
  ) {
    super(app);
    // Pre-fetch folders
    if (this.plugin.settings.showManualFolderSearch) {
        this.allFolders = this.plugin.vaultScanner.getAllFolders();
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
    if (!this.currentFile) {
        containerEl.createEl('h2', { text: 'Error: No file selected' });
        return;
    }
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
            this.close();
        });
  }

  private async processAndShowRecommendations() {
    try {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('p', { text: 'Analyzing and getting recommendations...' });

        // Analyze note
        const noteData = await this.plugin.noteAnalyzer.analyzeNote(this.currentFile);

        // Scan vault
        const vaultStructure = await this.plugin.vaultScanner.scanVault();
        this.vaultProfiles = vaultStructure;

        // Get recommendations (with optional embedding)
        this.recommendation = await this.plugin.llmCoordinator.recommendFolder(
            noteData,
            vaultStructure,
            this.userContext,
            this.currentFileEmbedding
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

  private showSelectStep(contentEl: HTMLElement) {
    contentEl.createEl('h2', { text: 'Recommended Folders' });

    if (!this.recommendation) return;

    // Primary
    this.renderRecommendation(
      contentEl,
      this.recommendation.primaryRecommendation,
      true
    );

    // Alternatives
    if (this.recommendation.alternatives.length > 0) {
        contentEl.createEl('h3', { text: 'Alternatives' });
        this.recommendation.alternatives.forEach(alt => {
            this.renderRecommendation(contentEl, alt, false);
        });
    }

    // Create New Folder Section (FIX 2.2)
    contentEl.createEl('hr', { cls: 'section-divider' });
    contentEl.createEl('h3', {
      text: 'Create New Folder',
      cls: 'section-heading'
    });

    const createFolderSection = contentEl.createDiv('create-folder-section');

    createFolderSection.createEl('p', {
      text: 'Or create a new folder with AI-suggested names:',
      cls: 'section-description'
    });

    const suggestionsContainer = createFolderSection.createDiv('folder-suggestions-container');
    suggestionsContainer.id = 'folder-suggestions';

    // Generate suggestions
    // top recs
    const topRecs = [this.recommendation.primaryRecommendation, ...this.recommendation.alternatives];

    this.generateAndShowFolderSuggestions(
      suggestionsContainer,
      this.currentFile,
      this.userContext,
      topRecs.slice(0, 3)
    );

    // Manual Search
    if (this.plugin.settings.showManualFolderSearch) {
        contentEl.createEl('hr');
        contentEl.createEl('h3', { text: 'Or select another folder:' });
        this.renderFolderSearch(contentEl);
    }

    // Actions
    const actionDiv = contentEl.createDiv('modal-actions');
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
            this.close();
        });
  }

  // FIX 3.4: Update Modal Display
  private renderRecommendation(containerEl: HTMLElement, rec: FolderRecommendation, isPrimary: boolean) {
    const div = containerEl.createDiv({
      cls: isPrimary ? 'recommendation-primary' : 'recommendation-alt'
    });

    div.createEl('h4', { text: `📁 ${rec.folderName}` });

    // Scores Row (New)
    const scoresRow = div.createDiv('scores-row');

    // Confidence
    const confidenceEl = scoresRow.createDiv('score-item');
    confidenceEl.createEl('label', { text: 'LLM Confidence:', cls: 'score-label' });
    const confValue = confidenceEl.createDiv('score-value');
    confValue.textContent = (rec.confidence).toFixed(0) + '%';
    confValue.classList.add(rec.confidence > 75 ? 'score-green' :
                             rec.confidence > 50 ? 'score-yellow' : 'score-red');

    // Similarity score (if available)
    if (rec.similarity !== undefined) {
      const similarityEl = scoresRow.createDiv('score-item');
      similarityEl.createEl('label', { text: 'Similarity:', cls: 'score-label' });
      const simValue = similarityEl.createDiv('score-value');
      simValue.textContent = (rec.similarity * 100).toFixed(0) + '%';
      simValue.classList.add(rec.similarity > 0.8 ? 'score-green' :
                             rec.similarity > 0.5 ? 'score-yellow' : 'score-red');
    }

    // Enhanced confidence (if available)
    if (rec.enhancedConfidence !== undefined && rec.enhancedConfidence !== rec.confidence) {
      const enhancedEl = scoresRow.createDiv('score-item');
      enhancedEl.createEl('label', { text: 'Enhanced:', cls: 'score-label' });
      const enhValue = enhancedEl.createDiv('score-value');
      enhValue.textContent = (rec.enhancedConfidence).toFixed(0) + '%';
      enhValue.classList.add(rec.enhancedConfidence > 75 ? 'score-green' :
                             rec.enhancedConfidence > 50 ? 'score-yellow' : 'score-red');
    }

    if (rec.reasoning) {
        div.createEl('p', { text: `Reason: ${rec.reasoning}` });
    }

    const btn = new ButtonComponent(div)
        .setButtonText('Select This Folder');

    if (isPrimary) {
        btn.setCta();
    }

    btn.onClick(async () => {
        await this.moveFile(rec.folderPath);
    });
  }

  // FIX 2.3: renderCreateFolderSection helpers
  async generateAndShowFolderSuggestions(container: HTMLElement, file: TFile, userContext: string, topRecs: FolderRecommendation[]) {
    try {
      const suggestions = await this.plugin.llmCoordinator.generateFolderNames(
        file,
        userContext,
        topRecs
      );

      container.empty();

      suggestions.forEach((suggestion, index) => {
        const suggestionItem = container.createDiv('folder-suggestion-item');

        // Mark first as recommended
        if (index === 0) {
          suggestionItem.createEl('div', { cls: 'recommended-badge', text: 'Recommended' });
        }

        // Input for folder name
        const inputContainer = suggestionItem.createDiv('folder-suggestion-input-row');
        const input = inputContainer.createEl('input', {
          type: 'text',
          cls: 'folder-suggestion-input',
          value: suggestion
        });
        input.placeholder = 'Folder name';

        // Create & Move button
        const button = inputContainer.createEl('button', {
          text: 'Create & Move',
          cls: 'button-create-move'
        });

        button.onclick = async () => {
          const folderName = input.value.trim();
          if (!folderName) {
            alert('Please enter a folder name');
            return;
          }

          try {
            const success = await this.plugin.createFolderAndMove(
              folderName,
              file
            );

            if (success) {
              this.close();
              new Notice(`File moved to new folder: ${folderName}`);
            } else {
              alert('Failed to create folder or move file');
            }
          } catch (error) {
            console.error('Error creating folder:', error);
            // @ts-ignore
            alert('Error: ' + error.message);
          }
        };
      });

    } catch (error) {
      console.error('Error generating suggestions:', error);
      const errorEl = container.createEl('p');
      errorEl.textContent = 'Failed to generate suggestions';
      errorEl.style.color = 'var(--color-error)';
    }
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
              const folderEl = listContainer.createDiv('folder-item');

              const folderItemRow = folderEl.createDiv('folder-item-row');
              folderItemRow.style.width = '100%';

              // Folder name
              const nameDiv = folderItemRow.createDiv('folder-name');
              nameDiv.style.paddingLeft = `${folder.level * 15}px`;
              nameDiv.textContent = `📁 ${folder.name}`;

              if (this.vaultProfiles) {
                  const folderData = this.vaultProfiles.find(p => p.folderPath === folder.path);
                   if (folderData && folderData.hasValidCentroid && this.currentFileEmbedding) {
                       try {
                           const similarity = this.plugin.llmCoordinator.cosineSimilarity(
                               this.currentFileEmbedding,
                               folderData.folderCentroid!
                           );

                           const scoreEl = folderItemRow.createDiv('folder-score');
                           scoreEl.textContent = (similarity * 100).toFixed(0) + '%';
                           scoreEl.classList.add(similarity > 0.8 ? 'score-green' :
                                                 similarity > 0.5 ? 'score-yellow' : 'score-red');
                       } catch (e) { }
                   }
              }

              // Select button
              new ButtonComponent(folderItemRow)
                  .setButtonText('Select')
                  .setClass('button-small')
                  .onClick(async () => {
                      await this.moveFile(folder.path);
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

  private async moveFile(targetPath: string) {
      let targetFolder = this.plugin.app.vault.getAbstractFileByPath(targetPath);
      if (!targetFolder) {
         await this.plugin.app.vault.createFolder(targetPath);
      }

      const newPath = `${targetPath}/${this.currentFile.name}`;
      await this.plugin.app.fileManager.renameFile(this.currentFile, newPath);
      new Notice(`Moved note to: ${targetPath}`);
      this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}
