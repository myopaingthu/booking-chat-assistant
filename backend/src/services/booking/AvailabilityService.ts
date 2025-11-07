import BusinessHours, { IBusinessHours } from '../../models/BusinessHours';
import Blackout, { IBlackout } from '../../models/Blackout';
import Booking from '../../models/Booking';
import Service from '../../models/Service';

export interface TimeSlot {
  start: Date;
  end: Date;
  available: boolean;
}

export interface AvailabilityOptions {
  serviceId: string;
  startDate: Date;
  endDate: Date;
  businessId: string;
}

export class AvailabilityService {
  async getAvailableSlots(options: AvailabilityOptions): Promise<TimeSlot[]> {
    const { serviceId, startDate, endDate, businessId } = options;

    const service = await Service.findById(serviceId);
    if (!service || !service.enabled) {
      throw new Error('Service not found or disabled');
    }

    const businessHours = await BusinessHours.find({ businessId });
    const blackouts = await Blackout.find({
      businessId,
      $or: [
        { startDate: { $lte: endDate }, endDate: { $gte: startDate } },
        { startDate: { $lte: endDate }, endDate: null }
      ]
    });

    const existingBookings = await Booking.find({
      businessId,
      status: { $in: ['pending', 'confirmed'] },
      startISO: { $lt: endDate },
      endISO: { $gt: startDate }
    });

    const slots: TimeSlot[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();
      const dayHours = businessHours.find(h => h.weekday === dayOfWeek && !h.isClosed);

      if (dayHours) {
        const daySlots = this.generateDaySlots(
          currentDate,
          dayHours,
          service.durationMin,
          service.bufferMin,
          blackouts,
          existingBookings
        );
        slots.push(...daySlots);
      }

      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(0, 0, 0, 0);
    }

    return slots.filter(slot => slot.available);
  }

  private generateDaySlots(
    date: Date,
    hours: IBusinessHours,
    durationMin: number,
    bufferMin: number,
    blackouts: IBlackout[],
    bookings: any[]
  ): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const [openHour, openMin] = hours.open.split(':').map(Number);
    const [closeHour, closeMin] = hours.close.split(':').map(Number);

    const openTime = new Date(date);
    openTime.setHours(openHour, openMin, 0, 0);

    const closeTime = new Date(date);
    closeTime.setHours(closeHour, closeMin, 0, 0);

    let currentTime = new Date(openTime);

    while (currentTime < closeTime) {
      const slotEnd = new Date(currentTime);
      slotEnd.setMinutes(slotEnd.getMinutes() + durationMin);

      if (slotEnd > closeTime) {
        break;
      }

      const isBlackedOut = this.isDateBlackedOut(currentTime, blackouts);
      const hasOverlap = this.hasBookingOverlap(currentTime, slotEnd, bookings);

      slots.push({
        start: new Date(currentTime),
        end: new Date(slotEnd),
        available: !isBlackedOut && !hasOverlap
      });

      currentTime.setMinutes(currentTime.getMinutes() + durationMin + bufferMin);
    }

    return slots;
  }

  private isDateBlackedOut(date: Date, blackouts: IBlackout[]): boolean {
    return blackouts.some(blackout => {
      const start = new Date(blackout.startDate);
      start.setHours(0, 0, 0, 0);

      if (blackout.endDate) {
        const end = new Date(blackout.endDate);
        end.setHours(23, 59, 59, 999);
        return date >= start && date <= end;
      } else {
        const end = new Date(start);
        end.setHours(23, 59, 59, 999);
        return date >= start && date <= end;
      }
    });
  }

  private hasBookingOverlap(slotStart: Date, slotEnd: Date, bookings: any[]): boolean {
    return bookings.some(booking => {
      const bookingStart = new Date(booking.startISO);
      const bookingEnd = new Date(booking.endISO);
      return slotStart < bookingEnd && slotEnd > bookingStart;
    });
  }

  async isSlotAvailable(
    businessId: string,
    serviceId: string,
    startISO: Date,
    endISO: Date
  ): Promise<boolean> {
    const service = await Service.findById(serviceId);
    if (!service || service.businessId !== businessId) {
      return false;
    }

    const overlappingBooking = await Booking.findOne({
      businessId,
      status: { $in: ['pending', 'confirmed'] },
      startISO: { $lt: endISO },
      endISO: { $gt: startISO }
    });

    return !overlappingBooking;
  }
}

