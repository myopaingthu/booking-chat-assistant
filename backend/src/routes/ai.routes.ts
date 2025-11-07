import express, { Request, Response } from 'express';
import { AIOrchestrator } from '../services/ai/AIOrchestrator';

const router = express.Router();
const orchestrator = new AIOrchestrator();

router.post('/:businessId/answer', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const { message, threadId, lang } = req.body;

    if (!message || !threadId) {
      return res.status(400).json({ error: 'message and threadId are required' });
    }

    const response = await orchestrator.processMessage(
      businessId,
      message,
      threadId,
      lang
    );

    res.json(response);
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      answer: "I'm sorry, I encountered an error. Please try again."
    });
  }
});

export default router;

