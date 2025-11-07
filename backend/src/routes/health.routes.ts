import express, { Request, Response } from 'express';
import DatabaseConnection from '../config/database';

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const dbConnection = DatabaseConnection.getInstance();
    const dbHealth = await dbConnection.healthCheck();
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: dbHealth,
      service: 'booking-chat-assistant-backend'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;

