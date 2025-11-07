import mongoose, { Schema } from 'mongoose';

export interface ICustomer {
  name: string;
  phone: string;
}

export interface IBooking {
  _id?: string;
  businessId: string;
  serviceId: string;
  startISO: Date;
  endISO: Date;
  customer: ICustomer;
  status: 'pending' | 'confirmed' | 'cancelled';
  threadId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const BookingSchema = new Schema<IBooking>({
  businessId: {
    type: String,
    required: true,
    ref: 'Business'
  },
  serviceId: {
    type: String,
    required: true,
    ref: 'Service'
  },
  startISO: {
    type: Date,
    required: true
  },
  endISO: {
    type: Date,
    required: true
  },
  customer: {
    name: {
      type: String,
      required: true,
      trim: true
    },
    phone: {
      type: String,
      required: true,
      trim: true
    }
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'confirmed', 'cancelled'],
    default: 'pending'
  },
  threadId: {
    type: String,
    required: false
  }
}, {
  timestamps: true,
  collection: 'bookings'
});

BookingSchema.index({ businessId: 1, startISO: 1, endISO: 1 });
BookingSchema.index({ businessId: 1, status: 1 });
BookingSchema.index({ threadId: 1 });
BookingSchema.index({ startISO: 1, endISO: 1 });

export const Booking = mongoose.model<IBooking>('Booking', BookingSchema);
export default Booking;

