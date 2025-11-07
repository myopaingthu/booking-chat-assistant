import { LLMProvider } from './base/LLMProvider';
import { OllamaProvider } from './providers/OllamaProvider';
import { LLMConfig } from '../../types/LLM';

export type SupportedProvider = 'mistral' | 'ollama' | 'openai' | 'groq';

export class LLMService {
  private provider: LLMProvider;

  constructor(providerName: SupportedProvider, config: LLMConfig) {
    this.provider = this.createProvider(providerName, config);
  }

  private createProvider(providerName: SupportedProvider, config: LLMConfig): LLMProvider {
    switch (providerName) {
      case 'ollama':
        return new OllamaProvider(
          'not-needed',
          config.model || 'mistral',
          config.embeddingModel || 'mistral',
          process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
        );
      
      case 'mistral':
        throw new Error('Mistral API provider not yet implemented');
      
      case 'openai':
        throw new Error('OpenAI provider not yet implemented');
      
      case 'groq':
        throw new Error('Groq provider not yet implemented');
      
      default:
        throw new Error(`Unsupported LLM provider: ${providerName}`);
    }
  }

  async generateEmbedding(text: string) {
    return this.provider.generateEmbedding(text);
  }

  async generateResponse(messages: any[], systemPrompt?: string) {
    return this.provider.generateResponse(messages, systemPrompt);
  }

  getProviderInfo() {
    return {
      provider: this.provider.getProviderName(),
      ...this.provider.getModelInfo()
    };
  }

  static getSupportedProviders(): SupportedProvider[] {
    return ['mistral', 'ollama', 'openai', 'groq'];
  }

  static validateProvider(providerName: string): providerName is SupportedProvider {
    return this.getSupportedProviders().includes(providerName as SupportedProvider);
  }
}

