import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import DatabaseConnection from './config/database';
import healthRoutes from './routes/health.routes';
import businessRoutes from './routes/business.routes';
import bookingRoutes from './routes/booking.routes';
import kbRoutes from './routes/kb.routes';
import aiRoutes from './routes/ai.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/health', healthRoutes);
app.use('/api/businesses', businessRoutes);
app.use('/api/businesses', bookingRoutes);
app.use('/api/kb', kbRoutes);
app.use('/api/ai', aiRoutes);

app.get('/', (req, res) => {
  res.json({ 
    message: 'Booking Chat Assistant Backend API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      businesses: '/api/businesses',
      bookings: '/api/businesses/:businessId/bookings',
      kb: '/api/kb/:businessId/ingest',
      ai: '/api/ai/:businessId/answer'
    }
  });
});

async function startServer() {
  try {
    const dbConnection = DatabaseConnection.getInstance();
    await dbConnection.connect();
    
    app.listen(PORT, () => {
      console.log(`Booking Chat Assistant Backend running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  try {
    const dbConnection = DatabaseConnection.getInstance();
    await dbConnection.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

startServer();

