export interface LLMConfig {
  provider: string;
  model: string;
  embeddingModel: string;
  apiKey: string;
}

export interface ChunkingConfig {
  maxChunkSize: number;
  minChunkSize: number;
  overlap: number;
  respectBoundaries: boolean;
}

