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
            console.log('[MODAL] User entered context:', this.userContext.substring(0, 50));
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
        // When calling recommendFolder, PASS the user context
        this.recommendation = await this.plugin.llmCoordinator.recommendFolder(
            noteData,
            vaultStructure,
            this.userContext,
            this.currentFileEmbedding
        );

        console.log('[MODAL] Received recommendations with context applied');

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
    // Using detailed structure from feedback
    const recEl = containerEl.createDiv('recommendation-item');
    if (isPrimary) recEl.addClass('recommendation-primary');
    else recEl.addClass('recommendation-alt');

    // Show full path prominently
    const pathEl = recEl.createDiv('folder-path');
    pathEl.createEl('strong', {text: rec.folderPath || rec.folderName});
    console.log('[UI] Displaying recommendation:', rec.folderPath);

    // Show folder name as secondary info if different from path
    if (rec.folderPath !== rec.folderName && rec.folderName) {
      const nameEl = recEl.createDiv('folder-name');
      nameEl.textContent = '(' + rec.folderName + ')';
    }

    // Scores Row (New)
    const scoresRow = recEl.createDiv('scores-row');

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
        const reasonEl = recEl.createDiv('reasoning');
        reasonEl.textContent = rec.reasoning;
    }

    const buttonEl = recEl.createDiv('recommendation-buttons');
    const btn = new ButtonComponent(buttonEl)
        .setButtonText('Move Here');

    if (isPrimary) {
        btn.setCta();
    }

    btn.onClick(async () => {
        console.log('[UI] Moving file to:', rec.folderPath);
        await this.moveFile(rec.folderPath);
    });
  }

  // FIX 2.3: renderCreateFolderSection helpers
  async generateAndShowFolderSuggestions(container: HTMLElement, file: TFile, userContext: string, topRecs: FolderRecommendation[]) {
    console.log('[FOLDERCREATE] Generating folder suggestions...');

    try {
        const suggestion = await this.plugin.llmCoordinator.generateFolderNames(
            file,
            userContext,
            topRecs
        );

        console.log('[FOLDERCREATE] Suggestion received:', suggestion.primaryName);

        container.empty();

        // Show reasoning
        if (suggestion.reasoning) {
            const reasonEl = container.createDiv('folder-suggestion-reasoning');
            reasonEl.textContent = '💡 ' + suggestion.reasoning;
        }

        // Show suggested parent folders
        // @ts-ignore
        if (suggestion.suggestedParentFolders && suggestion.suggestedParentFolders.length > 0) {
            const parentSection = container.createDiv('parent-folders-section');
            parentSection.createEl('label', { text: 'Suggested parent folders:' });

            const parentList = parentSection.createDiv('parent-folders-list');
            // @ts-ignore
            suggestion.suggestedParentFolders.forEach((parentPath: string, index: number) => {
                const parentItem = parentList.createDiv('parent-folder-option');
                const radio = parentItem.createEl('input', {
                    type: 'radio',
                    // @ts-ignore
                    name: 'parent-folder',
                    value: parentPath
                });
                radio.id = 'parent-' + index;
                parentItem.createEl('label', {
                    text: parentPath,
                    cls: 'parent-label'
                }).setAttribute('for', 'parent-' + index);
            });

            // Also add option for root
            const rootItem = parentList.createDiv('parent-folder-option');
            const rootRadio = rootItem.createEl('input', {
                type: 'radio',
                // @ts-ignore
                name: 'parent-folder',
                value: '',
                checked: true // Defaults to root if none selected by user override logic, or maybe should be explicit. Feedback had checked: true.
            });
            rootRadio.id = 'parent-root';
            rootItem.createEl('label', {
                text: 'Vault root',
                cls: 'parent-label'
            }).setAttribute('for', 'parent-root');
        }

        // Input for folder name
        const inputSection = container.createDiv('folder-name-input-section');
        inputSection.createEl('label', { text: 'Folder name:' });

        const inputRow = inputSection.createDiv('folder-input-row');
        const input = inputRow.createEl('input', {
            type: 'text',
            cls: 'folder-name-input',
            value: suggestion.primaryName
        });
        input.placeholder = 'Folder name';

        // Create & Move button
        const button = inputRow.createEl('button', {
            text: 'Create & Move',
            cls: 'button-create-move'
        });

        button.onclick = async () => {
            const folderName = input.value.trim();
            if (!folderName) {
                alert('Please enter a folder name');
                return;
            }

            // Get selected parent folder
            const parentRadios = container.querySelectorAll('input[name="parent-folder"]');
            let parentPath = '';
            // @ts-ignore
            for (const radio of parentRadios) {
                // @ts-ignore
                if (radio.checked) {
                    // @ts-ignore
                    parentPath = radio.value;
                    break;
                }
            }

            // Build full path
            const fullPath = parentPath ? parentPath + '/' + folderName : folderName;

            console.log('[FOLDERCREATE] Creating folder at:', fullPath);

            try {
                const success = await this.plugin.createFolderAndMove(fullPath, this.currentFile);
                if (success) {
                    this.close();
                    new Notice(`File moved to: ${fullPath}`);
                } else {
                    alert('Failed to create folder or move file');
                }
            } catch (error) {
                console.error('[FOLDERCREATE] Error:', error);
                // @ts-ignore
                alert('Error: ' + error.message);
            }
        };

    } catch (error) {
        console.error('[FOLDERCREATE] Error generating suggestions:', error);
        const errorEl = container.createEl('p');
        // @ts-ignore
        errorEl.textContent = '⚠️ Failed to generate suggestions: ' + error.message;
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
                           const similarity = this.plugin.smartConnectionsService.cosineSimilarity(
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
