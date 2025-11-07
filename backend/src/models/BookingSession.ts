import mongoose, { Schema } from 'mongoose';

export interface IBookingSession {
  _id?: string;
  businessId: string;
  threadId: string;
  step: 'service' | 'date' | 'time' | 'name' | 'phone' | 'confirm' | 'complete';
  slot: {
    serviceId?: string;
    serviceName?: string;
    date?: string;
    time?: string;
    startISO?: Date;
    endISO?: Date;
    customerName?: string;
    customerPhone?: string;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const BookingSessionSchema = new Schema<IBookingSession>({
  businessId: {
    type: String,
    required: true,
    ref: 'Business'
  },
  threadId: {
    type: String,
    required: true
  },
  step: {
    type: String,
    required: true,
    enum: ['service', 'date', 'time', 'name', 'phone', 'confirm', 'complete'],
    default: 'service'
  },
  slot: {
    serviceId: String,
    serviceName: String,
    date: String,
    time: String,
    startISO: Date,
    endISO: Date,
    customerName: String,
    customerPhone: String
  }
}, {
  timestamps: true,
  collection: 'booking_sessions'
});

BookingSessionSchema.index({ businessId: 1, threadId: 1 }, { unique: true });
BookingSessionSchema.index({ threadId: 1 });

export const BookingSession = mongoose.model<IBookingSession>('BookingSession', BookingSessionSchema);
export default BookingSession;

