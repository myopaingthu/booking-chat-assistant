import { IntentDetector, Intent } from './IntentDetector';
import { FAQHandler } from './FAQHandler';
import { BookingFlowHandler } from './BookingFlowHandler';
import Message from '../../models/Message';

export interface AIResponse {
  answer: string;
  action?: 'booking_created' | 'booking_step' | 'handoff';
  citations?: Array<{
    title: string;
    section: string;
    category?: string;
  }>;
  confidence: number;
  nextStep?: 'service' | 'date' | 'time' | 'name' | 'phone' | 'confirm' | 'complete';
  bookingId?: string;
}

export class AIOrchestrator {
  private intentDetector: IntentDetector;
  private faqHandler: FAQHandler;
  private bookingHandler: BookingFlowHandler;

  constructor() {
    this.intentDetector = new IntentDetector();
    this.faqHandler = new FAQHandler();
    this.bookingHandler = new BookingFlowHandler();
  }

  async processMessage(
    businessId: string,
    message: string,
    threadId: string,
    lang?: string
  ): Promise<AIResponse> {
    try {
      await this.saveMessage(businessId, threadId, 'user', message);

      const conversationHistory = await this.getConversationHistory(businessId, threadId);

      const intentResult = await this.intentDetector.detectIntent(message, conversationHistory);

      console.log(`Intent detected: ${intentResult.intent} (confidence: ${intentResult.confidence})`);

      switch (intentResult.intent) {
        case 'faq':
          return await this.handleFAQ(businessId, message, threadId, conversationHistory, lang);

        case 'booking':
          return await this.handleBooking(businessId, message, threadId, conversationHistory);

        case 'handoff':
          return {
            answer: "I'll connect you with a team member. Please hold while we transfer your request.",
            action: 'handoff',
            confidence: 0.9
          };

        default:
          return {
            answer: "I'm not sure how to help with that. Could you please rephrase your question or let me know if you'd like to make a booking?",
            confidence: 0.5
          };
      }
    } catch (error) {
      console.error('AI Orchestrator error:', error);
      return {
        answer: "I'm sorry, I encountered an error processing your message. Please try again or contact us directly.",
        confidence: 0.1
      };
    }
  }

  private async handleFAQ(
    businessId: string,
    message: string,
    threadId: string,
    conversationHistory: Array<{role: string, content: string}>,
    lang?: string
  ): Promise<AIResponse> {
    const faqResponse = await this.faqHandler.answerQuestion(
      businessId,
      message,
      conversationHistory,
      lang
    );

    await this.saveMessage(businessId, threadId, 'assistant', faqResponse.answer);

    return {
      answer: faqResponse.answer,
      citations: faqResponse.citations,
      confidence: faqResponse.confidence
    };
  }

  private async handleBooking(
    businessId: string,
    message: string,
    threadId: string,
    conversationHistory: Array<{role: string, content: string}>
  ): Promise<AIResponse> {
    const bookingResponse = await this.bookingHandler.processMessage(
      businessId,
      message,
      threadId,
      conversationHistory
    );

    await this.saveMessage(businessId, threadId, 'assistant', bookingResponse.message);

    if (bookingResponse.bookingCreated) {
      return {
        answer: bookingResponse.message,
        action: 'booking_created',
        confidence: 0.9,
        nextStep: bookingResponse.step,
        bookingId: bookingResponse.bookingId
      };
    }

      return {
        answer: bookingResponse.message,
        action: 'booking_step',
        confidence: 0.8,
        nextStep: bookingResponse.step
      };
  }

  private async saveMessage(
    businessId: string,
    threadId: string,
    from: 'user' | 'assistant',
    text: string
  ): Promise<void> {
    try {
      const message = new Message({
        businessId,
        threadId,
        from,
        text,
        timestamp: new Date()
      });
      await message.save();
    } catch (error) {
      console.error('Failed to save message:', error);
    }
  }

  private async getConversationHistory(
    businessId: string,
    threadId: string
  ): Promise<Array<{role: string, content: string}>> {
    try {
      const messages = await Message.find({ businessId, threadId })
        .sort({ timestamp: 1 })
        .limit(10)
        .select('from text');

      return messages.map(msg => ({
        role: msg.from === 'user' ? 'user' : 'assistant',
        content: msg.text
      }));
    } catch (error) {
      console.error('Failed to get conversation history:', error);
      return [];
    }
  }
}

