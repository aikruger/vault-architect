import { PluginSettings, ChatMessage, OpenAIResponse } from '../models/types';

export interface AdapterOptions {
  temperature: number;
  model: string;
  maxTokens: number;
}

export interface LLMResponse {
  content: string;
  tokensUsed: number;
}

export class OpenAIAdapter {
  private apiKey: string;

  constructor(private settings: PluginSettings) {
    this.apiKey = settings.openaiApiKey;
  }

  async call(messages: ChatMessage[], options: AdapterOptions): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const url = 'https://api.openai.com/v1/chat/completions';

    const body = {
      model: options.model,
      messages: messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      response_format: { type: 'json_object' }  // For structured responses
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'VaultArchitectPlugin/1.0'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
      }

      const data: OpenAIResponse = await response.json();

      const firstChoice = data.choices[0];
      if (!firstChoice) {
        throw new Error('No response from OpenAI');
      }

      return {
        content: firstChoice.message.content,
        tokensUsed: data.usage?.total_tokens || 0
      };

    } catch (error) {
      throw new Error(`OpenAI API call failed: ${(error as Error).message}`);
    }
  }
}
