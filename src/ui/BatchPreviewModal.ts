import { App, Modal, ButtonComponent, TFile, Setting } from 'obsidian';

export interface BatchMove {
    file: TFile;
    destination: string;
    confidence: number;
    reasoning: string;
    selected: boolean;
}

export class BatchPreviewModal extends Modal {
    constructor(
        app: App,
        private moves: BatchMove[],
        private onConfirm: (moves: BatchMove[]) => void
    ) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: `Batch Classification: ${this.moves.length} notes` });
        contentEl.createEl('p', { text: 'Review proposed moves below.' });

        const listContainer = contentEl.createDiv({ cls: 'batch-list-container' });

        this.moves.forEach(move => {
            const row = listContainer.createDiv({ cls: 'batch-row' });

            const checkbox = row.createEl('input', { type: 'checkbox' });
            checkbox.checked = move.selected;
            checkbox.onclick = () => { move.selected = checkbox.checked; };

            const details = row.createDiv({ cls: 'batch-details' });

            details.createEl('div', {
                text: move.file.basename,
                cls: 'batch-name'
            });

            details.createEl('div', {
                text: `→ ${move.destination} (${move.confidence}%)`,
                cls: 'batch-dest'
            });

            details.createEl('div', {
                text: move.reasoning,
                cls: 'batch-reason'
            });
        });

        const buttonContainer = contentEl.createDiv({ cls: 'button-container' });

        new ButtonComponent(buttonContainer)
            .setButtonText('Cancel')
            .onClick(() => this.close());

        new ButtonComponent(buttonContainer)
            .setButtonText(`Move Selected Files`)
            .setCta()
            .onClick(() => {
                const selected = this.moves.filter(m => m.selected);
                this.onConfirm(selected);
                this.close();
            });
    }

    onClose() {
        this.contentEl.empty();
    }
}
