import KBChunk, { IKBChunk } from '../../models/KBChunk';
import { LLMService } from '../llm/LLMService';
import { BusinessTextChunk } from '../chunking/BusinessTextChunker';
import { LLMConfig } from '../../types/LLM';

export interface VectorSearchResult {
  content: string;
  metadata: {
    businessId: string;
    source: string;
    section: string;
    title: string;
    category?: string;
    lang?: string;
  };
  score: number;
}

export interface VectorStoreConfig {
  collection: string;
  indexName: string;
  maxResults: number;
  similarityThreshold: number;
}

export class KBVectorStore {
  private llmService: LLMService;
  private config: VectorStoreConfig;

  constructor(config?: Partial<VectorStoreConfig>) {
    this.config = {
      collection: 'kb_chunks',
      indexName: 'kb_vector_index',
      maxResults: 5,
      similarityThreshold: 0.5,
      ...config
    };

    const llmConfig: LLMConfig = {
      provider: 'ollama',
      model: process.env.OLLAMA_MODEL || 'mistral',
      embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || 'mistral',
      apiKey: 'not-needed'
    };
    this.llmService = new LLMService('ollama', llmConfig);
  }

  async insertChunk(chunk: BusinessTextChunk): Promise<IKBChunk> {
    try {
      const embeddingResult = await this.llmService.generateEmbedding(chunk.content);
      
      const kbChunk = new KBChunk({
        businessId: chunk.metadata.businessId,
        source: chunk.metadata.source,
        text: chunk.content,
        embedding: embeddingResult.embedding,
        lang: chunk.metadata.lang || 'en',
        metadata: {
          section: chunk.metadata.section,
          title: chunk.metadata.title,
          category: chunk.metadata.category
        }
      });

      const savedChunk = await kbChunk.save();
      return savedChunk;
    } catch (error) {
      console.error(`Failed to insert chunk from ${chunk.metadata.source}:`, error);
      throw new Error(`Vector store insertion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async insertChunks(chunks: BusinessTextChunk[]): Promise<IKBChunk[]> {
    const results: IKBChunk[] = [];
    const totalChunks = chunks.length;

    console.log(`Inserting ${totalChunks} chunks into vector store...`);

    for (let i = 0; i < chunks.length; i++) {
      try {
        const result = await this.insertChunk(chunks[i]);
        results.push(result);
        
        if ((i + 1) % 10 === 0 || i === chunks.length - 1) {
          console.log(`Progress: ${i + 1}/${totalChunks} chunks processed (${Math.round(((i + 1) / totalChunks) * 100)}%)`);
        }
      } catch (error) {
        console.error(`Failed to insert chunk ${i + 1}:`, error);
      }
    }

    console.log(`Successfully inserted ${results.length}/${chunks.length} chunks`);
    return results;
  }

  async searchSimilar(
    query: string,
    businessId: string,
    lang?: string,
    limit?: number
  ): Promise<VectorSearchResult[]> {
    try {
      const queryEmbedding = await this.llmService.generateEmbedding(query);
      const finalLimit = limit || this.config.maxResults;
      
      const vectorSearchStage: any = {
        index: this.config.indexName,
        path: 'embedding',
        queryVector: queryEmbedding.embedding,
        numCandidates: Math.max(100, finalLimit * 20),
        limit: Math.max(20, finalLimit * 3)
      };

      const pipeline: any[] = [
        {
          $vectorSearch: vectorSearchStage
        },
        {
          $match: {
            businessId: businessId
          }
        }
      ];

      if (lang) {
        pipeline[1].$match.lang = lang;
      }

      pipeline.push(
        {
          $project: {
            text: 1,
            businessId: 1,
            source: 1,
            lang: 1,
            metadata: 1,
            score: { $meta: 'vectorSearchScore' }
          }
        },
        {
          $match: {
            score: { $gte: this.config.similarityThreshold }
          }
        },
        {
          $sort: { score: -1 }
        },
        {
          $limit: finalLimit
        }
      );

      const results = await KBChunk.aggregate(pipeline);
      
      return results.map((doc: any) => ({
        content: doc.text,
        metadata: {
          businessId: doc.businessId,
          source: doc.source,
          section: doc.metadata?.section || '',
          title: doc.metadata?.title || '',
          category: doc.metadata?.category,
          lang: doc.lang
        },
        score: doc.score || 0
      }));

    } catch (error) {
      console.error('Vector search failed:', error);
      throw new Error(`Vector search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async clearBusinessKB(businessId: string): Promise<void> {
    try {
      const result = await KBChunk.deleteMany({ businessId });
      console.log(`Cleared ${result.deletedCount} chunks for business ${businessId}`);
    } catch (error) {
      console.error('Failed to clear business KB:', error);
      throw new Error(`Failed to clear business KB: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getBusinessKBStats(businessId: string): Promise<{
    totalChunks: number;
    bySection: Record<string, number>;
    byLang: Record<string, number>;
  }> {
    try {
      const totalChunks = await KBChunk.countDocuments({ businessId });

      const sectionStats = await KBChunk.aggregate([
        { $match: { businessId } },
        { $group: { _id: '$metadata.section', count: { $sum: 1 } } }
      ]);

      const langStats = await KBChunk.aggregate([
        { $match: { businessId } },
        { $group: { _id: '$lang', count: { $sum: 1 } } }
      ]);

      const bySection: Record<string, number> = {};
      sectionStats.forEach((stat: any) => {
        bySection[stat._id || 'unknown'] = stat.count;
      });

      const byLang: Record<string, number> = {};
      langStats.forEach((stat: any) => {
        byLang[stat._id || 'unknown'] = stat.count;
      });

      return {
        totalChunks,
        bySection,
        byLang
      };
    } catch (error) {
      console.error('Failed to get KB stats:', error);
      throw new Error(`Failed to get KB stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async searchSimilarWithSourcePriority(
    query: string,
    businessId: string,
    prioritySources: string[],
    lang?: string,
    limit?: number
  ): Promise<VectorSearchResult[]> {
    try {
      if (!prioritySources || prioritySources.length === 0) {
        return this.searchSimilar(query, businessId, lang, limit);
      }

      const queryEmbedding = await this.llmService.generateEmbedding(query);
      const finalLimit = limit || this.config.maxResults;
      
      const vectorSearchStage: any = {
        index: this.config.indexName,
        path: 'embedding',
        queryVector: queryEmbedding.embedding,
        numCandidates: Math.max(100, finalLimit * 20),
        limit: Math.max(30, finalLimit * 4)
      };

      const matchStage: any = {
        businessId: businessId
      };

      if (lang) {
        matchStage.lang = lang;
      }

      const pipeline: any[] = [
        {
          $vectorSearch: vectorSearchStage
        },
        {
          $match: matchStage
        },
        {
          $project: {
            text: 1,
            businessId: 1,
            source: 1,
            lang: 1,
            metadata: 1,
            score: { $meta: 'vectorSearchScore' }
          }
        },
        {
          $match: {
            score: { $gte: this.config.similarityThreshold * 0.8 }
          }
        }
      ];

      const results = await KBChunk.aggregate(pipeline);
      
      const mappedResults = results.map((doc: any) => ({
        content: doc.text,
        metadata: {
          businessId: doc.businessId,
          source: doc.source,
          section: doc.metadata?.section || '',
          title: doc.metadata?.title || '',
          category: doc.metadata?.category,
          lang: doc.lang
        },
        score: doc.score || 0,
        originalScore: doc.score || 0
      }));

      const boostedResults = mappedResults.map((result: any) => {
        let boost = 0;
        const sourceIndex = prioritySources.indexOf(result.metadata.source);
        
        if (sourceIndex !== -1) {
          boost = (prioritySources.length - sourceIndex) * 0.2;
        }
        
        return {
          ...result,
          score: result.score + boost
        };
      });

      boostedResults.sort((a: any, b: any) => b.score - a.score);

      return boostedResults.slice(0, finalLimit);

    } catch (error) {
      console.error('Vector search with source priority failed:', error);
      return this.searchSimilar(query, businessId, lang, limit);
    }
  }
}

