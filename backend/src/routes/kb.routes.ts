import express, { Request, Response } from 'express';
import { KBVectorStore } from '../services/vector/KBVectorStore';
import { BusinessTextChunker } from '../services/chunking/BusinessTextChunker';
import KBChunk from '../models/KBChunk';

const router = express.Router();

router.post('/:businessId/ingest', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const { content, clearExisting = true } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const chunker = new BusinessTextChunker();
    const chunks = chunker.chunkBusinessContent({
      businessId,
      hours: content.hours,
      location: content.location,
      services: content.services,
      policies: content.policies,
      faqs: content.faqs,
      additionalInfo: content.additionalInfo,
      lang: content.lang || 'en'
    });

    const vectorStore = new KBVectorStore();

    if (clearExisting) {
      await vectorStore.clearBusinessKB(businessId);
    }

    const results = await vectorStore.insertChunks(chunks);

    res.status(201).json({
      message: 'KB ingested successfully',
      chunksInserted: results.length,
      businessId
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get('/:businessId/search', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const { query, lang, limit } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const vectorStore = new KBVectorStore();
    const results = await vectorStore.searchSimilar(
      query as string,
      businessId,
      lang as string,
      limit ? parseInt(limit as string) : undefined
    );

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get('/:businessId/stats', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const vectorStore = new KBVectorStore();
    const stats = await vectorStore.getBusinessKBStats(businessId);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.delete('/:businessId/clear', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const vectorStore = new KBVectorStore();
    await vectorStore.clearBusinessKB(businessId);
    res.json({ message: 'KB cleared successfully', businessId });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export default router;

