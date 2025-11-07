export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
}

export interface ChatResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export abstract class LLMProvider {
  protected apiKey: string;
  protected model: string;
  protected embeddingModel: string;

  constructor(apiKey: string, model: string, embeddingModel: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.embeddingModel = embeddingModel;
  }

  abstract generateEmbedding(text: string): Promise<EmbeddingResponse>;
  
  abstract generateResponse(
    messages: ChatMessage[], 
    systemPrompt?: string
  ): Promise<ChatResponse>;

  abstract getProviderName(): string;
  
  abstract getModelInfo(): {
    chatModel: string;
    embeddingModel: string;
    maxTokens: number;
    contextWindow: number;
  };

  protected validateApiKey(): void {
    if (!this.apiKey || this.apiKey.trim() === '') {
      throw new Error(`${this.getProviderName()}: API key is required`);
    }
  }

  protected validateText(text: string): void {
    if (!text || text.trim() === '') {
      throw new Error('Text cannot be empty');
    }
  }

  protected validateMessages(messages: ChatMessage[]): void {
    if (!messages || messages.length === 0) {
      throw new Error('Messages array cannot be empty');
    }

    for (const message of messages) {
      if (!message.role || !message.content) {
        throw new Error('Each message must have role and content');
      }
    }
  }
}

