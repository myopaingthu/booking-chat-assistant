import express, { Request, Response } from 'express';
import { BookingService } from '../services/booking/BookingService';

const router = express.Router();
const bookingService = new BookingService();

router.get('/:businessId/bookings', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const { startDate, endDate, status, limit, skip } = req.query;

    const options: any = {};
    if (startDate) options.startDate = new Date(startDate as string);
    if (endDate) options.endDate = new Date(endDate as string);
    if (status) options.status = status;
    if (limit) options.limit = parseInt(limit as string);
    if (skip) options.skip = parseInt(skip as string);

    const bookings = await bookingService.getBookingsByBusiness(businessId, options);
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post('/:businessId/bookings', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const { serviceId, startISO, endISO, customer, threadId } = req.body;

    if (!serviceId || !startISO || !endISO || !customer || !customer.name || !customer.phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const booking = await bookingService.createBooking({
      businessId,
      serviceId,
      startISO: new Date(startISO),
      endISO: new Date(endISO),
      customer,
      threadId
    });

    res.status(201).json(booking);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get('/:businessId/bookings/:bookingId', async (req: Request, res: Response) => {
  try {
    const { businessId, bookingId } = req.params;
    const booking = await bookingService.getBookingById(bookingId, businessId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    res.json(booking);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.patch('/:businessId/bookings/:bookingId/status', async (req: Request, res: Response) => {
  try {
    const { businessId, bookingId } = req.params;
    const { status } = req.body;

    if (!['pending', 'confirmed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const booking = await bookingService.updateBookingStatus(
      bookingId,
      businessId,
      status
    );
    res.json(booking);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.delete('/:businessId/bookings/:bookingId', async (req: Request, res: Response) => {
  try {
    const { businessId, bookingId } = req.params;
    await bookingService.deleteBooking(bookingId, businessId);
    res.json({ message: 'Booking deleted' });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export default router;

