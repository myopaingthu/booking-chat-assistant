import express, { Request, Response } from 'express';
import Service from '../models/Service';
import BusinessHours from '../models/BusinessHours';
import Blackout from '../models/Blackout';
import Business from '../models/Business';

const router = express.Router();

router.get('/:businessId/services', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const services = await Service.find({ businessId, enabled: true });
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post('/:businessId/services', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const service = new Service({ ...req.body, businessId });
    await service.save();
    res.status(201).json(service);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.put('/:businessId/services/:serviceId', async (req: Request, res: Response) => {
  try {
    const { businessId, serviceId } = req.params;
    const service = await Service.findOneAndUpdate(
      { _id: serviceId, businessId },
      req.body,
      { new: true }
    );
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }
    res.json(service);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.delete('/:businessId/services/:serviceId', async (req: Request, res: Response) => {
  try {
    const { businessId, serviceId } = req.params;
    const result = await Service.deleteOne({ _id: serviceId, businessId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }
    res.json({ message: 'Service deleted' });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get('/:businessId/hours', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const hours = await BusinessHours.find({ businessId });
    res.json(hours);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post('/:businessId/hours', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const hours = new BusinessHours({ ...req.body, businessId });
    await hours.save();
    res.status(201).json(hours);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.put('/:businessId/hours/:hoursId', async (req: Request, res: Response) => {
  try {
    const { businessId, hoursId } = req.params;
    const hours = await BusinessHours.findOneAndUpdate(
      { _id: hoursId, businessId },
      req.body,
      { new: true }
    );
    if (!hours) {
      return res.status(404).json({ error: 'Business hours not found' });
    }
    res.json(hours);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.delete('/:businessId/hours/:hoursId', async (req: Request, res: Response) => {
  try {
    const { businessId, hoursId } = req.params;
    const result = await BusinessHours.deleteOne({ _id: hoursId, businessId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Business hours not found' });
    }
    res.json({ message: 'Business hours deleted' });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get('/:businessId/blackouts', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const blackouts = await Blackout.find({ businessId });
    res.json(blackouts);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post('/:businessId/blackouts', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const blackout = new Blackout({ ...req.body, businessId });
    await blackout.save();
    res.status(201).json(blackout);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.put('/:businessId/blackouts/:blackoutId', async (req: Request, res: Response) => {
  try {
    const { businessId, blackoutId } = req.params;
    const blackout = await Blackout.findOneAndUpdate(
      { _id: blackoutId, businessId },
      req.body,
      { new: true }
    );
    if (!blackout) {
      return res.status(404).json({ error: 'Blackout not found' });
    }
    res.json(blackout);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.delete('/:businessId/blackouts/:blackoutId', async (req: Request, res: Response) => {
  try {
    const { businessId, blackoutId } = req.params;
    const result = await Blackout.deleteOne({ _id: blackoutId, businessId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Blackout not found' });
    }
    res.json({ message: 'Blackout deleted' });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get('/:businessId/availability', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const { serviceId, startDate, endDate } = req.query;

    if (!serviceId || !startDate || !endDate) {
      return res.status(400).json({ error: 'serviceId, startDate, and endDate are required' });
    }

    const { AvailabilityService } = await import('../services/booking/AvailabilityService');
    const availabilityService = new AvailabilityService();

    const slots = await availabilityService.getAvailableSlots({
      serviceId: serviceId as string,
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string),
      businessId
    });

    res.json(slots);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export default router;

