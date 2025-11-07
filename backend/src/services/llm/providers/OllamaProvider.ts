import { LLMProvider, EmbeddingResponse, ChatResponse, ChatMessage } from '../base/LLMProvider';

interface OllamaEmbeddingRequest {
  model: string;
  prompt: string;
}

interface OllamaEmbeddingResponse {
  embedding: number[];
}

interface OllamaChatRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string;
  }>;
  stream: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider extends LLMProvider {
  private readonly baseUrl: string;
  private readonly defaultMaxTokens = 4000;
  private readonly defaultTemperature = 0.7;

  constructor(
    apiKey: string = 'not-needed', 
    model: string = 'mistral', 
    embeddingModel: string = 'mistral',
    baseUrl: string = 'http://localhost:11434'
  ) {
    super(apiKey, model, embeddingModel);
    this.baseUrl = baseUrl;
  }

  async generateEmbedding(text: string): Promise<EmbeddingResponse> {
    this.validateText(text);

    try {
      const requestBody: OllamaEmbeddingRequest = {
        model: this.embeddingModel,
        prompt: text
      };

      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.text().catch(() => 'Unknown error');
        throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorData}`);
      }

      const data: OllamaEmbeddingResponse = await response.json();

      if (!data.embedding || data.embedding.length === 0) {
        throw new Error('No embedding data received from Ollama API');
      }

      return {
        embedding: data.embedding,
        model: this.embeddingModel,
        usage: {
          promptTokens: Math.ceil(text.split(' ').length * 1.3),
          totalTokens: Math.ceil(text.split(' ').length * 1.3)
        }
      };

    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Ollama embedding generation failed: ${error.message}`);
      }
      throw new Error('Unknown error occurred during embedding generation');
    }
  }

  async generateResponse(
    messages: ChatMessage[], 
    systemPrompt?: string
  ): Promise<ChatResponse> {
    this.validateMessages(messages);

    try {
      const chatMessages = [...messages];
      
      if (systemPrompt) {
        chatMessages.unshift({
          role: 'system',
          content: systemPrompt
        });
      }

      const requestBody: OllamaChatRequest = {
        model: this.model,
        messages: chatMessages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        stream: false,
        options: {
          temperature: this.defaultTemperature,
          num_predict: this.defaultMaxTokens
        }
      };

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.text().catch(() => 'Unknown error');
        throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorData}`);
      }

      const data: OllamaChatResponse = await response.json();

      if (!data.message || !data.message.content) {
        throw new Error('No response message received from Ollama API');
      }

      return {
        content: data.message.content,
        model: data.model,
        usage: {
          promptTokens: data.prompt_eval_count || 0,
          completionTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
        },
        finishReason: data.done ? 'stop' : 'length'
      };

    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Ollama chat generation failed: ${error.message}`);
      }
      throw new Error('Unknown error occurred during chat generation');
    }
  }

  getProviderName(): string {
    return 'Ollama (Local Mistral)';
  }

  getModelInfo(): { chatModel: string; embeddingModel: string; maxTokens: number; contextWindow: number } {
    return {
      chatModel: this.model,
      embeddingModel: this.embeddingModel,
      maxTokens: this.defaultMaxTokens,
      contextWindow: 32000
    };
  }
}

