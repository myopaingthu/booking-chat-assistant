import { LLMService } from '../llm/LLMService';
import { LLMConfig } from '../../types/LLM';
import { AvailabilityService } from '../booking/AvailabilityService';
import { BookingService } from '../booking/BookingService';
import Service from '../../models/Service';
import BookingSession from '../../models/BookingSession';

export type BookingStep = 'service' | 'date' | 'time' | 'name' | 'phone' | 'confirm' | 'complete';

export interface BookingSlot {
  serviceId?: string;
  serviceName?: string;
  date?: string;
  time?: string;
  startISO?: Date;
  endISO?: Date;
  customerName?: string;
  customerPhone?: string;
}

export interface BookingFlowState {
  step: BookingStep;
  slot: BookingSlot;
  availableSlots?: Array<{start: Date, end: Date}>;
  message: string;
  requiresConfirmation?: boolean;
}

export interface BookingFlowResponse {
  message: string;
  step: BookingStep;
  requiresInput: boolean;
  availableSlots?: Array<{start: Date, end: Date}>;
  bookingCreated?: boolean;
  bookingId?: string;
}

export class BookingFlowHandler {
  private llmService: LLMService;
  private availabilityService: AvailabilityService;
  private bookingService: BookingService;

  constructor() {
    const llmConfig: LLMConfig = {
      provider: 'ollama',
      model: process.env.OLLAMA_MODEL || 'mistral',
      embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || 'mistral',
      apiKey: 'not-needed'
    };
    this.llmService = new LLMService('ollama', llmConfig);
    this.availabilityService = new AvailabilityService();
    this.bookingService = new BookingService();
  }

  async processMessage(
    businessId: string,
    message: string,
    threadId: string,
    conversationHistory?: Array<{role: string, content: string}>
  ): Promise<BookingFlowResponse> {
    try {
      let session = await BookingSession.findOne({ businessId, threadId });
      
      if (!session) {
        session = new BookingSession({
          businessId,
          threadId,
          step: 'service',
          slot: {}
        });
      }

      const extractedSlot = await this.extractSlotValues(message, session.slot, conversationHistory);
      
      const updatedSlot = { ...session.slot, ...extractedSlot };
      
      const nextStep = this.determineNextStep(updatedSlot);
      
      if (nextStep === 'service' && !updatedSlot.serviceId) {
        const services = await Service.find({ businessId, enabled: true });
        if (services.length === 1) {
          updatedSlot.serviceId = services[0]._id.toString();
          updatedSlot.serviceName = services[0].name;
        } else {
          return {
            message: this.getServiceSelectionMessage(services),
            step: 'service',
            requiresInput: true
          };
        }
      }

      if (nextStep === 'date' && updatedSlot.serviceId) {
        const date = updatedSlot.date || this.extractDate(message);
        if (date) {
          updatedSlot.date = date;
        } else {
          return {
            message: "When would you like to book? Please provide a date (e.g., 'tomorrow', 'December 25', or 'next Monday').",
            step: 'date',
            requiresInput: true
          };
        }
      }

      if (nextStep === 'time' && updatedSlot.date && updatedSlot.serviceId) {
        const service = await Service.findById(updatedSlot.serviceId);
        if (!service) {
          return {
            message: "Service not found. Please start over.",
            step: 'service',
            requiresInput: true
          };
        }

        const startDate = this.parseDate(updatedSlot.date);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 7);

        const availableSlots = await this.availabilityService.getAvailableSlots({
          serviceId: updatedSlot.serviceId,
          startDate,
          endDate,
          businessId
        });

        if (availableSlots.length === 0) {
          return {
            message: `Sorry, there are no available slots for ${updatedSlot.date}. Would you like to choose a different date?`,
            step: 'date',
            requiresInput: true
          };
        }

        const selectedTime = updatedSlot.time || this.extractTime(message);
        if (selectedTime) {
          const selectedSlot = this.findMatchingSlot(availableSlots, selectedTime);
          if (selectedSlot) {
            updatedSlot.startISO = selectedSlot.start;
            updatedSlot.endISO = selectedSlot.end;
            updatedSlot.time = this.formatTime(selectedSlot.start);
          } else {
            return {
              message: this.getTimeSelectionMessage(availableSlots),
              step: 'time',
              requiresInput: true,
              availableSlots: availableSlots.map(s => ({ start: s.start, end: s.end }))
            };
          }
        } else {
          return {
            message: this.getTimeSelectionMessage(availableSlots),
            step: 'time',
            requiresInput: true,
            availableSlots: availableSlots.map(s => ({ start: s.start, end: s.end }))
          };
        }
      }

      if (nextStep === 'name' && updatedSlot.startISO) {
        const name = updatedSlot.customerName || this.extractName(message);
        if (name) {
          updatedSlot.customerName = name;
        } else {
          return {
            message: "What's your name?",
            step: 'name',
            requiresInput: true
          };
        }
      }

      if (nextStep === 'phone' && updatedSlot.customerName) {
        const phone = updatedSlot.customerPhone || this.extractPhone(message);
        if (phone) {
          updatedSlot.customerPhone = phone;
        } else {
          return {
            message: "What's your phone number?",
            step: 'phone',
            requiresInput: true
          };
        }
      }

      if (nextStep === 'confirm' && updatedSlot.customerPhone && updatedSlot.startISO) {
        const confirmation = message.toLowerCase().match(/\b(yes|confirm|ok|sure|proceed)\b/);
        if (!confirmation) {
          const service = await Service.findById(updatedSlot.serviceId);
          const confirmationMessage = this.buildConfirmationMessage(updatedSlot, service?.name || '');
          
          session.step = 'confirm';
          session.slot = updatedSlot;
          await session.save();
          
          return {
            message: confirmationMessage,
            step: 'confirm',
            requiresInput: true
          };
        }
      }

      if (nextStep === 'complete' && updatedSlot.customerPhone && updatedSlot.startISO) {
        const booking = await this.bookingService.createBooking({
          businessId,
          serviceId: updatedSlot.serviceId!,
          startISO: updatedSlot.startISO!,
          endISO: updatedSlot.endISO!,
          customer: {
            name: updatedSlot.customerName!,
            phone: updatedSlot.customerPhone!
          },
          threadId
        });

        await BookingSession.deleteOne({ businessId, threadId });

        return {
          message: `Great! Your booking is confirmed. Booking ID: ${booking._id}. We'll see you on ${this.formatDate(updatedSlot.startISO!)} at ${updatedSlot.time}.`,
          step: 'complete',
          requiresInput: false,
          bookingCreated: true,
          bookingId: booking._id?.toString()
        };
      }

      session.step = nextStep;
      session.slot = updatedSlot;
      await session.save();

      return {
        message: this.getStepMessage(nextStep, updatedSlot),
        step: nextStep,
        requiresInput: true
      };
    } catch (error) {
      console.error('Booking flow error:', error);
      throw new Error(`Booking flow failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async extractSlotValues(
    message: string,
    currentSlot: BookingSlot,
    history?: Array<{role: string, content: string}>
  ): Promise<Partial<BookingSlot>> {
    const prompt = `Extract booking information from this customer message. Current booking state: ${JSON.stringify(currentSlot)}

Customer message: "${message}"

Extract and return ONLY the values that are explicitly mentioned in the message. Return JSON:
{
  "serviceName": "extracted service name or null",
  "date": "extracted date or null",
  "time": "extracted time or null",
  "customerName": "extracted name or null",
  "customerPhone": "extracted phone or null"
}`;

    try {
      const response = await this.llmService.generateResponse([
        { role: 'user', content: prompt }
      ]);

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Slot extraction error:', error);
    }

    return {};
  }

  private determineNextStep(slot: BookingSlot): BookingStep {
    if (!slot.serviceId) return 'service';
    if (!slot.date) return 'date';
    if (!slot.startISO) return 'time';
    if (!slot.customerName) return 'name';
    if (!slot.customerPhone) return 'phone';
    if (slot.customerPhone && !slot.startISO) return 'confirm';
    return 'complete';
  }

  private extractDate(message: string): string | null {
    const datePatterns = [
      /(tomorrow|today|next week|next monday|next tuesday|next wednesday|next thursday|next friday|next saturday|next sunday)/i,
      /(december|january|february|march|april|may|june|july|august|september|october|november)\s+\d{1,2}/i,
      /\d{1,2}\/\d{1,2}\/\d{4}/,
      /\d{4}-\d{2}-\d{2}/
    ];

    for (const pattern of datePatterns) {
      const match = message.match(pattern);
      if (match) return match[0];
    }

    return null;
  }

  private extractTime(message: string): string | null {
    const timePatterns = [
      /\d{1,2}:\d{2}\s*(am|pm)/i,
      /\d{1,2}:\d{2}/,
      /\d{1,2}\s*(am|pm)/i
    ];

    for (const pattern of timePatterns) {
      const match = message.match(pattern);
      if (match) return match[0];
    }

    return null;
  }

  private extractName(message: string): string | null {
    const namePattern = /(?:my name is|i'm|i am|call me|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i;
    const match = message.match(namePattern);
    return match ? match[1] : null;
  }

  private extractPhone(message: string): string | null {
    const phonePattern = /(\+?\d{1,4}[\s-]?\(?\d{1,4}\)?[\s-]?\d{1,4}[\s-]?\d{1,4}[\s-]?\d{1,9})/;
    const match = message.match(phonePattern);
    return match ? match[1].replace(/\s+/g, '') : null;
  }

  private findMatchingSlot(slots: Array<{start: Date, end: Date, available: boolean}>, timeStr: string): {start: Date, end: Date} | null {
    const targetTime = this.parseTime(timeStr);
    if (!targetTime) return null;

    for (const slot of slots) {
      if (slot.available) {
        const slotTime = new Date(slot.start);
        if (Math.abs(slotTime.getHours() - targetTime.getHours()) <= 1 &&
            Math.abs(slotTime.getMinutes() - targetTime.getMinutes()) <= 30) {
          return { start: slot.start, end: slot.end };
        }
      }
    }

    return null;
  }

  private parseTime(timeStr: string): Date | null {
    const now = new Date();
    const [time, period] = timeStr.toLowerCase().split(/\s*(am|pm)/);
    const [hours, minutes] = time.split(':').map(Number);

    let hour = hours || 0;
    const min = minutes || 0;

    if (period === 'pm' && hour !== 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;

    const result = new Date(now);
    result.setHours(hour, min, 0, 0);
    return result;
  }

  private parseDate(dateStr: string): Date {
    const now = new Date();
    const lower = dateStr.toLowerCase();

    if (lower.includes('tomorrow')) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }

    if (lower.includes('today')) {
      return now;
    }

    const dateMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dateMatch) {
      return new Date(parseInt(dateMatch[3]), parseInt(dateMatch[1]) - 1, parseInt(dateMatch[2]));
    }

    return new Date(dateStr);
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  private getServiceSelectionMessage(services: any[]): string {
    if (services.length === 0) {
      return "Sorry, no services are available at the moment.";
    }

    const serviceList = services.map((s, i) => `${i + 1}. ${s.name} (${s.durationMin} minutes)`).join('\n');
    return `Which service would you like to book?\n\n${serviceList}\n\nPlease reply with the service name or number.`;
  }

  private getTimeSelectionMessage(slots: Array<{start: Date, end: Date, available: boolean}>): string {
    const available = slots.filter(s => s.available).slice(0, 10);
    if (available.length === 0) {
      return "Sorry, no available time slots found for this date.";
    }

    const timeList = available.map((s, i) => {
      const time = this.formatTime(s.start);
      return `${i + 1}. ${time}`;
    }).join('\n');

    return `Here are available time slots:\n\n${timeList}\n\nPlease choose a time.`;
  }

  private getStepMessage(step: BookingStep, slot: BookingSlot): string {
    switch (step) {
      case 'service':
        return "Which service would you like to book?";
      case 'date':
        return "When would you like to book?";
      case 'time':
        return "What time would you prefer?";
      case 'name':
        return "What's your name?";
      case 'phone':
        return "What's your phone number?";
      default:
        return "Please provide the required information.";
    }
  }

  private buildConfirmationMessage(slot: BookingSlot, serviceName: string): string {
    return `Please confirm your booking:\n\n` +
           `Service: ${serviceName}\n` +
           `Date: ${slot.date}\n` +
           `Time: ${slot.time}\n` +
           `Name: ${slot.customerName}\n` +
           `Phone: ${slot.customerPhone}\n\n` +
           `Reply "yes" or "confirm" to complete the booking.`;
  }
}

