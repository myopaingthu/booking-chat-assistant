import Booking, { IBooking } from '../../models/Booking';
import Service from '../../models/Service';
import { AvailabilityService } from './AvailabilityService';

export class BookingService {
  private availabilityService: AvailabilityService;

  constructor() {
    this.availabilityService = new AvailabilityService();
  }

  async createBooking(bookingData: {
    businessId: string;
    serviceId: string;
    startISO: Date;
    endISO: Date;
    customer: { name: string; phone: string };
    threadId?: string;
  }): Promise<IBooking> {
    const { businessId, serviceId, startISO, endISO } = bookingData;

    const service = await Service.findById(serviceId);
    if (!service || service.businessId !== businessId) {
      throw new Error('Service not found or does not belong to business');
    }

    const isAvailable = await this.availabilityService.isSlotAvailable(
      businessId,
      serviceId,
      startISO,
      endISO
    );

    if (!isAvailable) {
      throw new Error('Time slot is not available');
    }

    const booking = new Booking({
      ...bookingData,
      status: 'pending'
    });

    return await booking.save();
  }

  async getBookingById(bookingId: string, businessId?: string): Promise<IBooking | null> {
    const query: any = { _id: bookingId };
    if (businessId) {
      query.businessId = businessId;
    }
    return await Booking.findOne(query);
  }

  async getBookingsByBusiness(
    businessId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      status?: string;
      limit?: number;
      skip?: number;
    }
  ): Promise<IBooking[]> {
    const query: any = { businessId };

    if (options?.startDate || options?.endDate) {
      query.startISO = {};
      if (options.startDate) {
        query.startISO.$gte = options.startDate;
      }
      if (options.endDate) {
        query.startISO.$lte = options.endDate;
      }
    }

    if (options?.status) {
      query.status = options.status;
    }

    const bookings = Booking.find(query)
      .sort({ startISO: 1 })
      .limit(options?.limit || 100)
      .skip(options?.skip || 0);

    return await bookings;
  }

  async updateBookingStatus(
    bookingId: string,
    businessId: string,
    status: 'pending' | 'confirmed' | 'cancelled'
  ): Promise<IBooking> {
    const booking = await Booking.findOne({ _id: bookingId, businessId });
    if (!booking) {
      throw new Error('Booking not found');
    }

    booking.status = status;
    return await booking.save();
  }

  async cancelBooking(bookingId: string, businessId: string): Promise<IBooking> {
    return this.updateBookingStatus(bookingId, businessId, 'cancelled');
  }

  async confirmBooking(bookingId: string, businessId: string): Promise<IBooking> {
    return this.updateBookingStatus(bookingId, businessId, 'confirmed');
  }

  async deleteBooking(bookingId: string, businessId: string): Promise<void> {
    const result = await Booking.deleteOne({ _id: bookingId, businessId });
    if (result.deletedCount === 0) {
      throw new Error('Booking not found');
    }
  }

  async getBookingsByThread(threadId: string): Promise<IBooking[]> {
    return await Booking.find({ threadId }).sort({ startISO: 1 });
  }
}

