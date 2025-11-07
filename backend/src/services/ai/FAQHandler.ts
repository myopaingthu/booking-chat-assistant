import { ChatOllama } from "@langchain/community/chat_models/ollama";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { KBVectorStore, VectorSearchResult } from '../vector/KBVectorStore';

export interface FAQResponse {
  answer: string;
  citations: Array<{
    title: string;
    section: string;
    category?: string;
  }>;
  confidence: number;
}

export class FAQHandler {
  private llm: ChatOllama;
  private vectorStore: KBVectorStore;
  private promptTemplate: PromptTemplate;

  constructor() {
    this.llm = new ChatOllama({
      baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      model: process.env.OLLAMA_MODEL || "mistral",
      temperature: 0.7,
    });

    this.vectorStore = new KBVectorStore();
    this.promptTemplate = this.createPromptTemplate();
  }

  async answerQuestion(
    businessId: string,
    question: string,
    conversationHistory?: Array<{role: string, content: string}>,
    lang?: string
  ): Promise<FAQResponse> {
    try {
      const prioritySources = await this.determinePrioritySources(question);
      
      console.log(`Determined priority sources for query: ${prioritySources.join(', ')}`);

      const contextDocs = await this.vectorStore.searchSimilarWithSourcePriority(
        question,
        businessId,
        prioritySources,
        lang,
        5
      );

      if (contextDocs.length === 0) {
        return {
          answer: "I don't have enough information to answer that question. Please contact us directly for assistance.",
          citations: [],
          confidence: 0.1
        };
      }

      const contextText = this.buildContextText(contextDocs);
      const chatHistory = this.formatConversationHistory(conversationHistory || []);

      const chain = this.promptTemplate
        .pipe(this.llm)
        .pipe(new StringOutputParser());

      const response = await chain.invoke({
        businessContext: contextText,
        chatHistory: chatHistory,
        question: question
      });

      const citations = contextDocs.map((doc: any) => ({
        title: doc.metadata.title,
        section: doc.metadata.section,
        category: doc.metadata.category
      }));

      const confidence = this.calculateConfidence(contextDocs);

      return {
        answer: response,
        citations,
        confidence
      };
    } catch (error) {
      console.error('FAQ handler error:', error);
      throw new Error(`FAQ processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async determinePrioritySources(question: string): Promise<string[]> {
    try {
      const prompt = `Analyze this customer question and determine which business information sources are most relevant.

Customer question: "${question}"

Available sources:
- business-hours: Operating hours, open/close times, days of operation
- business-location: Address, directions, parking, contact information
- business-services: Services offered, service descriptions, service menu
- business-policies: Cancellation policy, payment methods, terms and conditions
- business-faqs: Frequently asked questions and answers
- business-additional-info: General business information, history, team, specialties

Return ONLY a JSON array with the top 2-3 most relevant sources, ordered by priority (most relevant first).

Example responses:
Question: "What are your hours?" → ["business-hours", "business-location"]
Question: "What services do you offer?" → ["business-services"]
Question: "How can I pay?" → ["business-policies", "business-faqs"]
Question: "Where are you located?" → ["business-location"]

Your response (JSON array only):`;

      const messages = [
        {
          role: 'user' as const,
          content: prompt
        }
      ];

      const response = await this.llm.invoke(messages);
      
      const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      
      const jsonMatch = content.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        const sources = JSON.parse(jsonMatch[0]);
        if (Array.isArray(sources) && sources.length > 0) {
          return sources.filter(s => typeof s === 'string');
        }
      }

      return this.fallbackSourceDetermination(question);
    } catch (error) {
      console.error('Error determining priority sources:', error);
      return this.fallbackSourceDetermination(question);
    }
  }

  private fallbackSourceDetermination(question: string): string[] {
    const lowerQuestion = question.toLowerCase();

    if (/\b(service|services|offer|provide|menu|treatment|procedure)\b/.test(lowerQuestion)) {
      return ['business-services'];
    }
    
    if (/\b(hour|hours|open|close|when|time|schedule|day)\b/.test(lowerQuestion)) {
      return ['business-hours', 'business-location'];
    }
    
    if (/\b(location|address|where|map|directions|parking)\b/.test(lowerQuestion)) {
      return ['business-location'];
    }
    
    if (/\b(price|cost|fee|payment|pay|charge|accept|card|cash)\b/.test(lowerQuestion)) {
      return ['business-policies', 'business-faqs'];
    }
    
    if (/\b(cancel|cancellation|refund|reschedule|policy|policies)\b/.test(lowerQuestion)) {
      return ['business-policies'];
    }
    
    if (/\b(contact|phone|call|reach|email)\b/.test(lowerQuestion)) {
      return ['business-location', 'business-additional-info'];
    }

    return [];
  }

  private createPromptTemplate(): PromptTemplate {
    return PromptTemplate.fromTemplate(`
You are a helpful customer service assistant for a business. Answer customer questions based ONLY on the business information provided below.

## Guidelines
- Answer questions accurately using ONLY the information from the business context
- Be friendly, professional, and concise
- If the answer is not in the context, say so clearly
- NEVER make up information that isn't in the context
- Use the same language as the customer's question
- For business hours, location, services, and policies, provide specific details from the context

## Business Information
{businessContext}

## Conversation History
{chatHistory}

## Customer Question
{question}

Your response:
    `);
  }

  private buildContextText(docs: VectorSearchResult[]): string {
    if (docs.length === 0) {
      return 'No business information available.';
    }

    return docs
      .map((doc, index) => {
        const section = doc.metadata.section ? `[${doc.metadata.section}]` : '';
        return `${section} ${doc.content}`;
      })
      .join('\n\n');
  }

  private formatConversationHistory(history: Array<{role: string, content: string}>): string {
    if (history.length === 0) return 'No previous conversation.';
    
    return history
      .slice(-5)
      .map(msg => `${msg.role === 'user' ? 'Customer' : 'Assistant'}: ${msg.content}`)
      .join('\n');
  }

  private calculateConfidence(docs: VectorSearchResult[]): number {
    if (docs.length === 0) return 0.1;

    const avgScore = docs.reduce((sum, doc) => sum + doc.score, 0) / docs.length;
    
    if (avgScore >= 0.8) return 0.9;
    if (avgScore >= 0.7) return 0.8;
    if (avgScore >= 0.6) return 0.7;
    return 0.6;
  }
}

