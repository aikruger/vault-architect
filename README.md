# Vault Architect

An AI-powered semantic folder placement and vault organization plugin for Obsidian.

Vault Architect uses OpenAI's language models to analyze your notes and recommend optimal folder placements based on semantic content analysis. It helps maintain a well-organized vault structure that reflects the actual content and relationships between your notes.

## Features

### 🎯 AI-Powered Folder Recommendations
- **Semantic Analysis**: Analyzes note content, tags, headings, and links to understand context
- **Smart Suggestions**: Recommends the best folder placement with confidence scores and reasoning
- **Multiple Options**: Provides primary recommendation plus alternatives
- **New Folder Detection**: Suggests creating new folders when existing ones don't fit

### 📦 Batch Inbox Classification
- **Process Multiple Notes**: Classify entire folders (like your Inbox) in one operation
- **Preview Before Moving**: Review all proposed moves with confidence scores
- **Selective Application**: Choose which recommendations to apply
- **Confidence Filtering**: Only shows recommendations above your configured threshold

### 🔍 Vault Structure Analysis
- **Comprehensive Reports**: Get detailed analysis of your vault organization
- **Issue Detection**: Identifies orphaned notes, overcrowded folders, semantic overlaps
- **Optimization Recommendations**: Receive actionable suggestions for improvements
- **Health Scoring**: See your vault's organizational health score

### 📝 Automatic Folder Note Generation
- **Document Folders**: Auto-generate index/README files for folders
- **Content Summaries**: Includes descriptions of notes within the folder
- **Relationship Mapping**: Documents related folders and key topics
- **Customizable Names**: Supports index.md, _index.md, README.md, and custom names

### 🔗 Smart Connections Integration
- **Vector Embeddings**: Uses Smart Connections plugin for semantic similarity (when available)
- **Fallback Support**: Falls back to OpenAI embeddings if Smart Connections not available
- **Enhanced Accuracy**: Leverages existing embeddings for better recommendations

## Commands

Vault Architect provides the following commands (accessible via Command Palette):

### Recommend Folder for Current Note
Analyzes the currently open note and suggests optimal folder placement.
- **Shortcut**: Customizable hotkey
- **Trigger**: Can also auto-trigger on note creation (configurable)
- **Output**: Modal with primary recommendation + alternatives

### Classify Inbox
Batch-processes notes in a specified folder (default: "Inbox").
- **Use Case**: Organize accumulated notes in your inbox
- **Output**: Preview modal showing all proposed moves
- **Interaction**: Select which moves to apply

### Analyze & Optimize Vault Structure
Performs comprehensive analysis of your entire vault structure.
- **Analysis**: Scans all folders and notes
- **Reports**: Identifies organizational issues and opportunities
- **Suggestions**: Provides specific recommendations for improvement

### Generate Folder Note
Creates or updates an index/README file for the current folder.
- **Context-Aware**: Analyzes all notes in the folder
- **AI-Generated**: Creates coherent summary and documentation
- **Configurable**: Respects your folder note naming preferences

## Settings

### General
- **Enable on note creation**: Auto-recommend folder when creating new notes
- **Confidence threshold**: Minimum confidence score (50-95%) for showing recommendations
- **Show detailed rationale**: Display reasoning behind recommendations

### OpenAI Integration
- **API Key**: Your OpenAI API key (required)
- **Model**: Choose between GPT-4 Turbo, GPT-4, or GPT-3.5 Turbo
- **Temperature**: Control creativity vs consistency (default: 0.3)
- **Max Tokens**: Maximum response length (default: 1000)

### Smart Connections
- **Use Smart Connections**: Leverage Smart Connections plugin embeddings
- **Fallback to OpenAI**: Use OpenAI embeddings if Smart Connections unavailable

### Content Analysis
- **Include full content**: Analyze complete note vs preview only
- **Content preview length**: Characters to include in preview (default: 500)
- **Analyze tags hierarchically**: Consider tag structure
- **Extract headings**: Include heading analysis

### Exclusions
- **Excluded folders**: Folders to ignore (regex patterns)
- **Excluded notes**: Notes to skip (regex patterns)
- **Excluded tags**: Tags that mark notes to exclude

### Automation
- **Batch classification**: Enable batch processing features
- **Auto-move if confident**: Automatically move notes above threshold
- **Auto-move threshold**: Minimum confidence for auto-move (default: 90%)

### UI/UX
- **Show toolbar button**: Display ribbon icon for quick access
- **Default action**: Preview, move, or ask on recommendations
- **Theme**: Auto, light, or dark mode

## Requirements

- **Obsidian**: Version 1.4.0 or higher
- **OpenAI API Key**: Required for AI analysis and recommendations
- **Smart Connections** (Optional): Enhanced semantic analysis with vector embeddings

## Installation

### From Obsidian Community Plugins (when available)
1. Open Settings → Community Plugins
2. Search for "Vault Architect"
3. Click Install
4. Enable the plugin

### Manual Installation
1. Download the latest release from GitHub
2. Extract files to `VaultFolder/.obsidian/plugins/vault-architect/`
3. Ensure `main.js`, `manifest.json`, and `styles.css` are in the folder
4. Reload Obsidian
5. Enable plugin in Settings → Community Plugins

## Configuration

1. Open Settings → Vault Architect
2. Enter your OpenAI API key
3. Select your preferred model (GPT-4 Turbo recommended)
4. Adjust confidence threshold based on your preferences
5. Configure exclusions for folders/notes you want to ignore
6. (Optional) Enable Smart Connections integration if you have it installed

## Usage

### Basic Workflow
1. Create or open a note
2. Run "Recommend Folder for Current Note" from Command Palette
3. Review recommendations with confidence scores and reasoning
4. Accept recommendation to move note or choose alternative

### Inbox Processing
1. Accumulate notes in your Inbox folder
2. Run "Classify Inbox" command
3. Review batch recommendations
4. Select which moves to apply
5. Confirm to execute selected moves

### Vault Maintenance
1. Periodically run "Analyze & Optimize Vault Structure"
2. Review identified issues and recommendations
3. Apply suggested improvements manually or use other commands
4. Track improvement in optimization score

## Development

### Setup
1. Clone this repository
2. Ensure Node.js v16+ is installed
3. Run `npm install` to install dependencies
4. Run `npm run dev` to start compilation in watch mode

### Building
- `npm run dev` - Compile in watch mode for development
- `npm run build` - Production build with type checking
- `npm run lint` - Run ESLint for code quality

### Local Testing
1. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/vault-architect/` folder
2. Reload Obsidian
3. Enable the plugin in Settings

### Publishing New Releases
1. Update version in `manifest.json`
2. Update `versions.json` with version compatibility
3. Run `npm version patch|minor|major` to bump versions
4. Create GitHub release with tag matching version
5. Upload `main.js`, `manifest.json`, and `styles.css` as release assets

### Code Quality
- ESLint is configured with Obsidian-specific rules
- Run `npm run lint` to check code quality
- GitHub Actions automatically lint all commits

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Ensure `npm run lint` passes
5. Submit a pull request

## License

This plugin is licensed under the 0-BSD License.

## Support

- **Issues**: Report bugs or request features on [GitHub Issues](https://github.com/aikruger/vault-architect/issues)
- **Discussions**: Ask questions or share ideas in [GitHub Discussions](https://github.com/aikruger/vault-architect/discussions)

## Acknowledgments

- Built with the [Obsidian Plugin API](https://docs.obsidian.md)
- Powered by [OpenAI](https://openai.com)
- Optional integration with [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections)
