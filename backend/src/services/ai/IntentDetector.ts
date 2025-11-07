import { LLMService } from '../llm/LLMService';
import { LLMConfig } from '../../types/LLM';

export type Intent = 'faq' | 'booking' | 'handoff';

export interface IntentDetectionResult {
  intent: Intent;
  confidence: number;
  reasoning?: string;
}

export class IntentDetector {
  private llmService: LLMService;

  constructor() {
    const llmConfig: LLMConfig = {
      provider: 'ollama',
      model: process.env.OLLAMA_MODEL || 'mistral',
      embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || 'mistral',
      apiKey: 'not-needed'
    };
    this.llmService = new LLMService('ollama', llmConfig);
  }

  async detectIntent(message: string, conversationHistory?: Array<{role: string, content: string}>): Promise<IntentDetectionResult> {
    try {
      const historyContext = conversationHistory && conversationHistory.length > 0
        ? conversationHistory.slice(-3).map(msg => `${msg.role}: ${msg.content}`).join('\n')
        : 'No previous conversation.';

      const prompt = `Analyze this customer message and determine the intent. Classify as:
- "faq": Questions about business hours, location, services, policies, or general information
- "booking": Requests to make, schedule, book, or reserve an appointment/service
- "handoff": Requests to speak with a human, complaints, or complex issues requiring human intervention

Customer message: "${message}"

Previous conversation:
${historyContext}

Respond ONLY with valid JSON in this exact format:
{
  "intent": "faq",
  "confidence": 0.9,
  "reasoning": "Customer is asking about operating hours"
}

Examples:
- "What are your hours?" → {"intent": "faq", "confidence": 0.95, "reasoning": "Question about business hours"}
- "I want to book an appointment" → {"intent": "booking", "confidence": 0.9, "reasoning": "Booking request"}
- "Can I speak to someone?" → {"intent": "handoff", "confidence": 0.85, "reasoning": "Request for human"}`;

      const messages = [
        {
          role: 'user' as const,
          content: prompt
        }
      ];

      const response = await this.llmService.generateResponse(messages);
      
      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          return this.validateIntent(result);
        }
      } catch (parseError) {
        console.error('Failed to parse LLM response for intent:', parseError);
      }

      return this.fallbackDetection(message);
    } catch (error) {
      console.error('Intent detection error:', error);
      return this.fallbackDetection(message);
    }
  }

  private validateIntent(result: any): IntentDetectionResult {
    const intent = result.intent;
    if (!['faq', 'booking', 'handoff'].includes(intent)) {
      return this.fallbackDetection('');
    }

    return {
      intent: intent as Intent,
      confidence: Math.min(Math.max(result.confidence || 0.7, 0), 1),
      reasoning: result.reasoning
    };
  }

  private fallbackDetection(message: string): IntentDetectionResult {
    const lowerMessage = message.toLowerCase();

    if (/\b(book|schedule|appointment|reserve|booking|available.*time|time.*slot)\b/.test(lowerMessage)) {
      return {
        intent: 'booking',
        confidence: 0.8,
        reasoning: 'Keyword-based: booking-related terms detected'
      };
    }

    if (/\b(speak|human|person|manager|complaint|problem|issue|help)\b/.test(lowerMessage)) {
      return {
        intent: 'handoff',
        confidence: 0.7,
        reasoning: 'Keyword-based: human assistance requested'
      };
    }

    return {
      intent: 'faq',
      confidence: 0.6,
      reasoning: 'Default: treating as FAQ question'
    };
  }
}

