import {
  App,
  Plugin,
  Editor,
  MarkdownView,
  TFile,
  TFolder,
  Notice
} from 'obsidian';
import {
  PluginSettings,
  DEFAULT_SETTINGS
} from './models/types';
import { NoteAnalyzer } from './services/NoteAnalyzer';
import { VaultScanner } from './services/VaultScanner';
import { LLMCoordinator } from './services/LLMCoordinator';
import { RecommendationModal } from './ui/RecommendationModal';
import { AnalysisPanel } from './ui/AnalysisPanel';
import { BatchPreviewModal, BatchMove } from './ui/BatchPreviewModal';
import { VaultArchitectSettings } from './ui/SettingsTab';
// Reuse existing commands logic where appropriate or rewrite inline as per spec

export default class VaultArchitectPlugin extends Plugin {
  settings: PluginSettings;

  // Services
  private noteAnalyzer: NoteAnalyzer;
  private vaultScanner: VaultScanner;
  private llmCoordinator: LLMCoordinator;

  async onload() {
    console.log('Loading Vault Architect plugin');

    // Load settings
    await this.loadSettings();

    // Initialize services
    this.noteAnalyzer = new NoteAnalyzer(this.app, this.settings);
    this.vaultScanner = new VaultScanner(this.app, this.settings);
    this.llmCoordinator = new LLMCoordinator(this.settings);

    // Register commands
    this.registerCommands();

    // Register settings tab
    this.addSettingTab(new VaultArchitectSettings(this.app, this));

    // Register ribbon icon (toolbar button)
    if (this.settings.showToolbarButton) {
      this.addRibbonIcon('folder', 'Vault Architect', () => {
        this.showFolderRecommendation();
      });
    }

    // Lifecycle hooks
    this.registerEvent(
        this.app.workspace.on('file-menu', (menu, file) => {
            if (file instanceof TFolder) {
                menu.addItem((item) => {
                    item
                        .setTitle('Classify Folder Contents')
                        .setIcon('folder-check')
                        .onClick(async () => {
                            await this.classifyFolder(file.path);
                        });
                });
            }
        })
    );

    this.registerEvent(
      this.app.vault.on('create', (file) => {
        if (this.settings.enableOnNoteCreation && file instanceof TFile && file.extension === 'md') {
            // Wait slightly for file to be populated if created via templates
            setTimeout(() => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile && activeFile.path === file.path) {
                    this.showFolderRecommendation();
                }
            }, 1000);
        }
      })
    );

    console.log('Vault Architect plugin loaded');
  }

  onunload() {
    console.log('Unloading Vault Architect plugin');
  }

  private registerCommands() {
    // Command 1: Recommend folder for current note
    this.addCommand({
      id: 'recommend-folder',
      name: 'Recommend Folder for Current Note',
      editorCallback: (editor: Editor, view: MarkdownView) => {
        this.showFolderRecommendation();
      },
      hotkeys: []  // User can customize
    });

    // Command 2: Classify inbox
    this.addCommand({
      id: 'classify-inbox',
      name: 'Classify Inbox',
      callback: async () => {
        await this.classifyFolder('Inbox');
      }
    });

    // Command 3: Analyze vault structure
    this.addCommand({
      id: 'analyze-vault',
      name: 'Analyze & Optimize Vault Structure',
      callback: async () => {
        await this.analyzeVaultStructure();
      }
    });

    // Command 4: Generate folder note
    this.addCommand({
        id: 'generate-folder-note',
        name: 'Generate folder note for current folder',
        callback: () => this.generateFolderNote()
    });
  }

  // ============================================
  // MAIN WORKFLOWS
  // ============================================

  async showFolderRecommendation() {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile || activeFile.extension !== 'md') {
      this.showError('Please open a markdown file');
      return;
    }

    try {
      this.showMessage('Analyzing note...');

      // Step 1: Analyze current note
      const noteData = await this.noteAnalyzer.analyzeNote(activeFile);

      // Step 2: Scan vault structure
      this.showMessage('Scanning vault structure...');
      const vaultStructure = await this.vaultScanner.scanVault();

      // Step 3: Get recommendations from LLM
      this.showMessage('Getting recommendations from AI...');
      const recommendations = await this.llmCoordinator.recommendFolder(
        noteData,
        vaultStructure
      );

      // Step 4: Show modal with recommendations
      new RecommendationModal(
        this.app,
        recommendations,
        activeFile,
        async (action: 'move' | 'preview' | 'cancel', targetPath?: string) => {
          if (action === 'move' && targetPath) {
            await this.moveNote(activeFile, targetPath);
          }
        }
      ).open();

    } catch (error) {
       // @ts-ignore
      this.showError(`Error: ${error.message}`);
      console.error(error);
    }
  }

  async classifyFolder(folderPath: string) {
    // Batch classification workflow
    try {
      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (!folder || !(folder instanceof TFolder)) {
        this.showError('Invalid folder');
        return;
      }

      const files = folder.children.filter(f => f instanceof TFile && f.extension === 'md') as TFile[];
      if (files.length === 0) {
        this.showMessage('No markdown files to classify.');
        return;
      }

      this.showMessage(`Classifying ${files.length} notes in ${folder.name}...`);
      const vaultStructure = await this.vaultScanner.scanVault();

      const proposedMoves: BatchMove[] = [];
      // Process sequentially to avoid rate limits
      for (const file of files) {
          try {
              const noteData = await this.noteAnalyzer.analyzeNote(file);
              const recommendation = await this.llmCoordinator.recommendFolder(noteData, vaultStructure);

              const primary = recommendation.primaryRecommendation;
              if (primary.confidence >= this.settings.confidenceThreshold && primary.folderPath !== folder.path) {
                  proposedMoves.push({
                      file: file,
                      destination: primary.folderPath,
                      confidence: primary.confidence,
                      reasoning: primary.reasoning,
                      selected: true
                  });
              }
          } catch (e) {
              console.error(`Failed to classify ${file.basename}`, e);
          }
      }

      if (proposedMoves.length === 0) {
          this.showMessage('No recommendations found above threshold.');
          return;
      }

      new BatchPreviewModal(this.app, proposedMoves, async (confirmedMoves) => {
          let movedCount = 0;
          for (const move of confirmedMoves) {
              await this.moveNote(move.file, move.destination);
              movedCount++;
          }
          this.showMessage(`Batch classification complete. Moved ${movedCount} notes.`);
      }).open();

    } catch (error) {
       // @ts-ignore
      this.showError(`Classification failed: ${error.message}`);
    }
  }

  async analyzeVaultStructure() {
    try {
      this.showMessage('Analyzing vault structure...');

      // Step 1: Scan entire vault
      const vaultStructure = await this.vaultScanner.scanVault();

      // Step 2: Get analysis from LLM
      const analysis = await this.llmCoordinator.analyzeVault(vaultStructure);

      // Step 3: Display analysis panel
      new AnalysisPanel(this.app, analysis).open();

    } catch (error) {
       // @ts-ignore
      this.showError(`Analysis failed: ${error.message}`);
    }
  }

  async generateFolderNote() {
       const activeFile = this.app.workspace.getActiveFile();
       if (!activeFile || !activeFile.parent) {
           this.showError('Please open a file within the folder you want to document.');
           return;
       }

       const folder = activeFile.parent;
       if (folder.isRoot()) {
           this.showError('Cannot generate note for root folder.');
           return;
       }

       this.showMessage(`Generating note for ${folder.name}...`);

       try {
           const files = folder.children.filter(f => f instanceof TFile && f.extension === 'md') as TFile[];
           if (files.length === 0) {
               this.showError('Folder is empty.');
               return;
           }

           // Collect summaries
           const summaries = [];
           for (const file of files) {
               if (this.settings.indexFileNames.includes(file.name)) continue;
               const note = await this.noteAnalyzer.analyzeNote(file);
               summaries.push(`- ${note.title}: ${note.contentPreview.substring(0, 200)}...`);
           }

           // Generate content via LLM (ad-hoc call via adapter for now, ideally add to Coordinator)
           // Since LLMCoordinator doesn't have a specific method for this in the provided spec,
           // I will add a generic call or use the adapter directly if accessible,
           // but `llmCoordinator` is private. I'll check `LLMCoordinator` or `OpenAIAdapter`.
           // `LLMCoordinator` has `openaiAdapter` private.
           // I'll assume I can add a method to `LLMCoordinator` or `VaultArchitectPlugin` has to do it.
           // For expediency/correctness with existing classes, I will instantiate a temporary adapter
           // or (better) I should have added `generateFolderNote` to `LLMCoordinator`.
           // But I can't easily modify `LLMCoordinator` if I want to stick to the provided spec strictly...
           // except I ALREADY created `LLMCoordinator` from the spec. I can modify it.
           // However, to keep it simple I will just use the `OpenAIAdapter` directly here by creating a new instance
           // or casting.

           // Generate content via LLM
           const content = await this.llmCoordinator.generateFolderNoteContent(summaries);

           const indexName = this.settings.indexFileNames[0] || 'index.md';
           const indexPath = `${folder.path}/${indexName}`;

           let file = this.app.vault.getAbstractFileByPath(indexPath);
           if (file instanceof TFile) {
               await this.app.vault.modify(file, content);
               this.showMessage(`Updated ${indexName}`);
           } else {
               await this.app.vault.create(indexPath, content);
               this.showMessage(`Created ${indexName}`);
           }

       } catch (e) {
           // @ts-ignore
           this.showError(`Failed to generate folder note: ${e.message}`);
       }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private async moveNote(file: TFile, targetPath: string) {
    let targetFolder = this.app.vault.getAbstractFileByPath(targetPath);
    if (!targetFolder) {
        await this.app.vault.createFolder(targetPath);
    }

    const newPath = `${targetPath}/${file.name}`;
    await this.app.fileManager.renameFile(file, newPath);
    this.showMessage(`Moved note to: ${targetPath}`);
  }

  private showMessage(message: string) {
    // Show in bottom right notification
    new Notice(message, 5000);
  }

  private showError(message: string) {
    console.error(message);
    new Notice(message, 0);  // persistent
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    // Reload services if needed
    this.llmCoordinator = new LLMCoordinator(this.settings);
    this.vaultScanner = new VaultScanner(this.app, this.settings);
    this.noteAnalyzer = new NoteAnalyzer(this.app, this.settings);
  }
}
