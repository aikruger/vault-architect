import { App, PluginSettingTab, Setting, ToggleComponent, SliderComponent, TextComponent, DropdownComponent } from 'obsidian';
import VaultArchitectPlugin from '../main';

export class VaultArchitectSettings extends PluginSettingTab {
    plugin: VaultArchitectPlugin;

    constructor(app: App, plugin: VaultArchitectPlugin) {
        super(app, plugin);
        this.plugin = plugin;
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
    }
}
