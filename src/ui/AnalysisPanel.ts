import { App, Modal, ButtonComponent } from 'obsidian';
import { VaultAnalysisReport } from '../models/types';

export class AnalysisPanel extends Modal {
  constructor(app: App, private report: VaultAnalysisReport) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: 'Vault Structure Analysis' });

    // Stats
    const statsDiv = contentEl.createDiv({ cls: 'vault-stats' });
    statsDiv.createEl('h3', { text: 'Statistics' });
    statsDiv.createEl('p', { text: `Total notes: ${this.report.vaultStats.totalNotes}` });
    statsDiv.createEl('p', { text: `Total folders: ${this.report.vaultStats.totalFolders}` });
    statsDiv.createEl('p', { text: `Avg notes/folder: ${this.report.vaultStats.avgNotesPerFolder.toFixed(1)}` });

    // Issues
    if (this.report.issues.length > 0) {
        contentEl.createEl('h3', { text: 'Issues detected' });
        const issuesList = contentEl.createEl('ul');
        this.report.issues.forEach(issue => {
            const li = issuesList.createEl('li');
            li.createEl('strong', { text: `[${issue.severity.toUpperCase()}] ${issue.type}: ` });
            li.createSpan({ text: issue.description });
        });
    }

    // Recommendations
    if (this.report.recommendations.length > 0) {
        contentEl.createEl('h3', { text: 'Recommendations' });
        const recList = contentEl.createEl('ul');
        this.report.recommendations.forEach(rec => {
            const li = recList.createEl('li');
            li.setText(`${rec.type.toUpperCase()}: ${rec.reasoning} (${rec.target})`);
        });
    }

    // Close button
    new ButtonComponent(contentEl)
        .setButtonText('Close')
        .onClick(() => this.close());
  }

  onClose() {
    this.contentEl.empty();
  }
}
