import { App, PluginSettingTab, Setting, ToggleComponent, SliderComponent, TextComponent, DropdownComponent, TextAreaComponent } from 'obsidian';
import VaultArchitectPlugin from '../main';
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_PROMPT_TEMPLATE } from '../constants';

export class VaultArchitectSettings extends PluginSettingTab {
    plugin: VaultArchitectPlugin;
    saveTimeout: any = null;

    constructor(app: App, plugin: VaultArchitectPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    updateStatusDisplay(status: any) {
        const dot = document.getElementById('sc-status-dot');
        const text = document.getElementById('sc-status-text');
        const list = document.getElementById('sc-feature-list');

        if (!dot || !text || !list) return;

        // Update dot color
        dot.classList.remove('connected', 'disconnected');
        dot.classList.add(status.connected ? 'connected' : 'disconnected');

        // Update status text
        text.innerHTML = status.connected
            ? '<span class="status-check">✓</span> ' + status.message
            : '<span class="status-x">✗</span> ' + status.message;

        // Update feature list
        list.innerHTML = '';
        if (status.features && status.features.length > 0) {
            status.features.forEach((feature: string) => {
                const item = list.createDiv('feature-item');
                item.innerHTML = '✓ ' + feature;
            });
        } else {
            const item = list.createDiv('feature-item');
            item.innerHTML = '<em>No features available</em>';
            item.style.color = 'var(--color-text-secondary)';
        }
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl).setName('General').setHeading();

        new Setting(containerEl)
            .setName('Enable on note creation')
            .setDesc('Automatically recommend a folder when a new note is created.')
            .addToggle((toggle: ToggleComponent) => toggle
                .setValue(this.plugin.settings.enableOnNoteCreation)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.enableOnNoteCreation = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Confidence threshold')
            .setDesc('Minimum confidence score (%) required.')
            .addSlider((slider: SliderComponent) => slider
                .setLimits(50, 95, 5)
                .setValue(this.plugin.settings.confidenceThreshold)
                .setDynamicTooltip()
                .onChange(async (value: number) => {
                    this.plugin.settings.confidenceThreshold = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl).setName('OpenAI integration').setHeading();

        new Setting(containerEl)
            .setName('API key')
            .setDesc('Your OpenAI API key.')
            .addText((text: TextComponent) => text
                .setPlaceholder('sk-...')
                .setValue(this.plugin.settings.openaiApiKey)
                .onChange(async (value: string) => {
                    this.plugin.settings.openaiApiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Model')
            .setDesc('OpenAI model to use.')
            .addDropdown((dropdown: DropdownComponent) => dropdown
                .addOption('gpt-4-turbo', 'GPT-4 Turbo')
                .addOption('gpt-4', 'GPT-4')
                .addOption('gpt-3.5-turbo', 'GPT-3.5 Turbo')
                .setValue(this.plugin.settings.openaiModel)
                .onChange(async (value: string) => {
                    this.plugin.settings.openaiModel = value as 'gpt-4-turbo' | 'gpt-4' | 'gpt-3.5-turbo';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl).setName('Smart connections').setHeading();

        new Setting(containerEl)
            .setName('Use Smart Connections')
            .setDesc('Use Smart Connections plugin for embeddings if available.')
            .addToggle((toggle: ToggleComponent) => toggle
                .setValue(this.plugin.settings.useSmartConnectionsIfAvailable)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.useSmartConnectionsIfAvailable = value;
                    await this.plugin.saveSettings();
                }));

        // Smart Connections Status Section
        containerEl.createEl('h3', {
            text: 'Smart Connections Status',
            cls: 'setting-heading'
        });

        const statusSection = containerEl.createDiv('sc-status-section');

        // Status indicator row
        const statusRow = statusSection.createDiv('status-indicator-row');

        // Status dot
        const statusDot = statusRow.createDiv('status-dot');
        statusDot.id = 'sc-status-dot';

        // Status text
        const statusText = statusRow.createDiv('status-text');
        statusText.id = 'sc-status-text';

        // Feature availability section
        const featureSection = statusSection.createDiv('feature-availability');
        featureSection.createEl('h4', {
            text: 'Available Features:'
        });

        const featureList = featureSection.createDiv('feature-list');
        featureList.id = 'sc-feature-list';

        // Check Status button
        new Setting(statusSection)
            .addButton((button) => {
                button
                    .setButtonText('Check Status')
                    .setCta()
                    .onClick(async () => {
                        // @ts-ignore
                        const status = await this.plugin.smartConnectionsService.getConnectionStatus();
                        this.updateStatusDisplay(status);
                    });
            });

        // Initial status check
        setTimeout(() => {
            // @ts-ignore
            if (this.plugin.smartConnectionsService) {
                // @ts-ignore
                this.plugin.smartConnectionsService.getConnectionStatus()
                    .then((status: any) => this.updateStatusDisplay(status));
            }
        }, 0);

        new Setting(containerEl).setName('Content analysis').setHeading();

         new Setting(containerEl)
            .setName('Include full note content')
            .setDesc('If disabled, only title, tags, and first 500 chars are used.')
            .addToggle((toggle: ToggleComponent) => toggle
                .setValue(this.plugin.settings.includeFullContent)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.includeFullContent = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl).setName('Folder Recommendation Settings').setHeading();

        new Setting(containerEl)
            .setName('Number of recommendations')
            .setDesc('How many folder recommendations to show.')
            .addSlider((slider: SliderComponent) => slider
                .setLimits(1, 5, 1)
                .setValue(this.plugin.settings.numberOfRecommendations)
                .setDynamicTooltip()
                .onChange(async (value: number) => {
                    this.plugin.settings.numberOfRecommendations = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Show folder search')
            .setDesc('Allow users to manually search and select folders.')
            .addToggle((toggle: ToggleComponent) => toggle
                .setValue(this.plugin.settings.showManualFolderSearch)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.showManualFolderSearch = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl).setName('Custom Prompts').setHeading();

        new Setting(containerEl)
            .setName('Use custom prompts')
            .setDesc('Enable to customize AI system and user prompts.')
            .addToggle((toggle: ToggleComponent) => toggle
                .setValue(this.plugin.settings.useCustomPrompts)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.useCustomPrompts = value;
                    await this.plugin.saveSettings();
                    this.display(); // Refresh to show/hide prompts
                }));

        if (this.plugin.settings.useCustomPrompts) {
            new Setting(containerEl)
                .setName("System Prompt")
                .setDesc("Custom system prompt for Claude API calls")
                .addTextArea((textarea) => {
                    textarea
                        .setPlaceholder("Enter your custom system prompt...")
                        .setValue(this.plugin.settings.customPrompts.systemPrompt || "")
                        .onChange((value) => {
                            this.plugin.settings.customPrompts.systemPrompt = value;

                            // Debounce the save to avoid excessive writes
                            if (this.saveTimeout) clearTimeout(this.saveTimeout);
                            this.saveTimeout = setTimeout(async () => {
                                await this.plugin.saveSettings();
                            }, 500);
                        });
                });

            new Setting(containerEl)
                .setName("User Prompt Template")
                .setDesc("Template for incorporating user context into prompts")
                .addTextArea((textarea) => {
                    textarea
                        .setPlaceholder("Enter your custom user template...")
                        .setValue(this.plugin.settings.customPrompts.userPromptTemplate || "")
                        .onChange((value) => {
                            this.plugin.settings.customPrompts.userPromptTemplate = value;

                            // Debounce the save
                            if (this.saveTimeout) clearTimeout(this.saveTimeout);
                            this.saveTimeout = setTimeout(async () => {
                                await this.plugin.saveSettings();
                            }, 500);
                        });
                });

            new Setting(containerEl)
                .setName("Reset Prompts")
                .setDesc("Restore prompts to plugin defaults")
                .addButton((button) => {
                    button
                        .setButtonText("Reset to Defaults")
                        .onClick(async () => {
                            this.plugin.settings.customPrompts.systemPrompt = DEFAULT_SYSTEM_PROMPT;
                            this.plugin.settings.customPrompts.userPromptTemplate = DEFAULT_USER_PROMPT_TEMPLATE;
                            await this.plugin.saveSettings();

                            // Refresh display
                            this.display();
                        });
                });
        }
    }
}
