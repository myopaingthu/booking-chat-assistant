import { ChunkingConfig } from '../../types/LLM';

export interface BusinessTextChunk {
  content: string;
  metadata: {
    businessId: string;
    source: string;
    section: string;
    title: string;
    category?: string;
    lang?: string;
  };
  chunkIndex: number;
  totalChunks: number;
}

export class BusinessTextChunker {
  private config: ChunkingConfig;

  constructor(config?: Partial<ChunkingConfig>) {
    this.config = {
      maxChunkSize: 500,
      minChunkSize: 100,
      overlap: 50,
      respectBoundaries: true,
      ...config
    };
  }

  chunkText(
    text: string,
    metadata: BusinessTextChunk['metadata'],
    contentType: 'hours' | 'services' | 'policies' | 'faq' | 'general'
  ): BusinessTextChunk[] {
    if (!text || text.trim() === '') {
      return [];
    }

    const cleanText = text.trim();
    
    if (contentType === 'faq') {
      return [{
        content: cleanText,
        metadata,
        chunkIndex: 0,
        totalChunks: 1
      }];
    }

    return this.recursiveChunking(cleanText, metadata);
  }

  private recursiveChunking(text: string, metadata: BusinessTextChunk['metadata']): BusinessTextChunk[] {
    const chunks: BusinessTextChunk[] = [];
    let currentIndex = 0;

    const paragraphs = this.splitByParagraphs(text);
    
    for (const paragraph of paragraphs) {
      if (this.getTokenCount(paragraph) <= this.config.maxChunkSize) {
        chunks.push({
          content: paragraph,
          metadata,
          chunkIndex: currentIndex,
          totalChunks: 0
        });
        currentIndex++;
      } else {
        const subChunks = this.splitLargeText(paragraph, metadata, currentIndex);
        chunks.push(...subChunks);
        currentIndex += subChunks.length;
      }
    }

    chunks.forEach(chunk => {
      chunk.totalChunks = chunks.length;
    });

    return this.addOverlap(chunks);
  }

  private splitByParagraphs(text: string): string[] {
    const paragraphs = text
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
    
    if (paragraphs.length <= 1) {
      return paragraphs;
    }
    
    const merged: string[] = [];
    let current = paragraphs[0];
    
    for (let i = 1; i < paragraphs.length; i++) {
      const para = paragraphs[i];
      const currentTokens = this.getTokenCount(current);
      const paraTokens = this.getTokenCount(para);
      
      const isNumberedList = /^\d+\./.test(para.trim());
      const isListContinuation = isNumberedList && /^\d+\./.test(current.trim());
      
      if ((isListContinuation || (isNumberedList && currentTokens < this.config.maxChunkSize * 0.8)) 
          && currentTokens + paraTokens <= this.config.maxChunkSize * 1.2) {
        current = current + '\n\n' + para;
      } else {
        merged.push(current);
        current = para;
      }
    }
    
    if (current) {
      merged.push(current);
    }
    
    return merged.length > 0 ? merged : paragraphs;
  }

  private splitLargeText(
    text: string, 
    metadata: BusinessTextChunk['metadata'], 
    startIndex: number
  ): BusinessTextChunk[] {
    const chunks: BusinessTextChunk[] = [];
    let currentText = text;
    let currentIndex = startIndex;

    while (currentText.length > 0) {
      let chunkSize = this.config.maxChunkSize;
      
      let breakPoint = this.findBreakPoint(currentText, chunkSize);
      
      if (breakPoint === -1 || breakPoint === 0) {
        breakPoint = this.findTokenBreakPoint(currentText, chunkSize);
      }

      if (breakPoint === 0) {
        breakPoint = currentText.length;
      }

      const chunkText = currentText.substring(0, breakPoint).trim();
      
      if (chunkText.length >= this.config.minChunkSize || currentText.length === chunkText.length) {
        chunks.push({
          content: chunkText,
          metadata,
          chunkIndex: currentIndex,
          totalChunks: 0
        });
        currentIndex++;
      }

      if (breakPoint >= currentText.length) {
        break;
      }

      currentText = currentText.substring(breakPoint).trim();
    }

    return chunks;
  }

  private findBreakPoint(text: string, maxTokens: number): number {
    const maxChars = this.estimateCharsFromTokens(maxTokens);
    
    if (text.length <= maxChars) {
      return text.length;
    }

    const sentenceEnd = text.lastIndexOf('. ', maxChars);
    if (sentenceEnd > maxChars * 0.7) {
      return sentenceEnd + 2;
    }

    const lineEnd = text.lastIndexOf('\n', maxChars);
    if (lineEnd > maxChars * 0.7) {
      return lineEnd + 1;
    }

    const wordEnd = text.lastIndexOf(' ', maxChars);
    if (wordEnd > maxChars * 0.8) {
      return wordEnd + 1;
    }

    return -1;
  }

  private findTokenBreakPoint(text: string, maxTokens: number): number {
    const words = text.split(' ');
    let currentTokens = 0;
    let breakPoint = 0;

    for (let i = 0; i < words.length; i++) {
      const wordTokens = this.getTokenCount(words[i]);
      
      if (currentTokens + wordTokens > maxTokens && i > 0) {
        break;
      }
      
      currentTokens += wordTokens;
      breakPoint += words[i].length + (i < words.length - 1 ? 1 : 0);
    }

    return breakPoint || text.length;
  }

  private addOverlap(chunks: BusinessTextChunk[]): BusinessTextChunk[] {
    if (chunks.length <= 1) {
      return chunks;
    }

    const totalTokens = chunks.reduce((sum, chunk) => sum + this.getTokenCount(chunk.content), 0);
    
    if (totalTokens < 300) {
      return chunks;
    }

    if (this.config.overlap <= 0) {
      return chunks;
    }

    const overlappedChunks: BusinessTextChunk[] = [];

    for (let i = 0; i < chunks.length; i++) {
      let content = chunks[i].content;
      const chunkTokens = this.getTokenCount(content);
      
      const adaptiveOverlap = Math.min(
        this.config.overlap,
        Math.floor(chunkTokens * 0.2)
      );

      if (i > 0 && adaptiveOverlap > 0) {
        const prevChunk = chunks[i - 1];
        const prevOverlap = this.getOverlapText(prevChunk.content, adaptiveOverlap);
        
        if (prevOverlap && !this.containsText(content, prevOverlap)) {
          content = prevOverlap + ' ' + content;
        }
      }

      if (i < chunks.length - 1 && adaptiveOverlap > 0) {
        const nextOverlap = this.getOverlapText(content, adaptiveOverlap);
        
        if (nextOverlap) {
          const nextChunk = chunks[i + 1];
          if (!this.containsText(nextChunk.content, nextOverlap)) {
            content = content + ' ' + nextOverlap;
          }
        }
      }

      overlappedChunks.push({
        ...chunks[i],
        content: content.trim()
      });
    }

    return overlappedChunks;
  }

  private containsText(largeText: string, searchText: string): boolean {
    const normalizedLarge = largeText.toLowerCase().replace(/\s+/g, ' ');
    const normalizedSearch = searchText.toLowerCase().replace(/\s+/g, ' ');
    
    if (normalizedSearch.length < 10) {
      return normalizedLarge.includes(normalizedSearch);
    }
    
    const searchWords = normalizedSearch.split(' ').filter(w => w.length > 3);
    if (searchWords.length === 0) {
      return false;
    }
    
    const matchCount = searchWords.filter(word => 
      normalizedLarge.includes(word)
    ).length;
    
    return matchCount >= Math.ceil(searchWords.length * 0.7);
  }

  private getOverlapText(text: string, overlapTokens: number): string {
    if (overlapTokens <= 0) {
      return '';
    }

    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) {
      return '';
    }

    const overlapWords: string[] = [];
    let currentTokens = 0;

    for (let i = words.length - 1; i >= 0; i--) {
      const wordTokens = this.getTokenCount(words[i]);
      
      if (currentTokens + wordTokens > overlapTokens) {
        break;
      }
      
      overlapWords.unshift(words[i]);
      currentTokens += wordTokens;
    }

    if (overlapWords.length === 0) {
      return '';
    }

    return overlapWords.join(' ');
  }

  private getTokenCount(text: string): number {
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    return Math.ceil(words.length * 1.3);
  }

  private estimateCharsFromTokens(tokens: number): number {
    return Math.floor(tokens * 4);
  }

  chunkBusinessContent(content: {
    businessId: string;
    hours?: string;
    location?: string;
    services?: string;
    policies?: string;
    faqs?: Array<{ question: string; answer: string }>;
    additionalInfo?: string;
    lang?: string;
  }): BusinessTextChunk[] {
    const chunks: BusinessTextChunk[] = [];
    const lang = content.lang || 'en';

    if (content.hours) {
      const hoursChunks = this.chunkText(
        content.hours,
        {
          businessId: content.businessId,
          source: 'business-hours',
          section: 'hours',
          title: 'Business Hours',
          category: 'hours',
          lang
        },
        'hours'
      );
      chunks.push(...hoursChunks);
    }

    if (content.location) {
      const locationChunks = this.chunkText(
        content.location,
        {
          businessId: content.businessId,
          source: 'business-location',
          section: 'location',
          title: 'Location',
          category: 'location',
          lang
        },
        'general'
      );
      chunks.push(...locationChunks);
    }

    if (content.services) {
      const servicesText = content.services.trim();
      const servicesTokenCount = this.getTokenCount(servicesText);
      
      if (servicesTokenCount <= this.config.maxChunkSize * 1.5) {
        const servicesChunks = this.chunkText(
          servicesText,
          {
            businessId: content.businessId,
            source: 'business-services',
            section: 'services',
            title: 'Services',
            category: 'services',
            lang
          },
          'services'
        );
        chunks.push(...servicesChunks);
      } else {
        const servicesChunks = this.chunkText(
          servicesText,
          {
            businessId: content.businessId,
            source: 'business-services',
            section: 'services',
            title: 'Services',
            category: 'services',
            lang
          },
          'general'
        );
        chunks.push(...servicesChunks);
      }
    }

    if (content.policies) {
      const policiesChunks = this.chunkText(
        content.policies,
        {
          businessId: content.businessId,
          source: 'business-policies',
          section: 'policies',
          title: 'Policies',
          category: 'policies',
          lang
        },
        'policies'
      );
      chunks.push(...policiesChunks);
    }

    if (content.faqs && Array.isArray(content.faqs)) {
      content.faqs.forEach((faq, index) => {
        const faqText = `Q: ${faq.question}\n\nA: ${faq.answer}`;
        const faqChunks = this.chunkText(
          faqText,
          {
            businessId: content.businessId,
            source: 'business-faqs',
            section: 'faq',
            title: faq.question,
            category: 'faq',
            lang
          },
          'faq'
        );
        chunks.push(...faqChunks);
      });
    }

    if (content.additionalInfo) {
      const additionalChunks = this.chunkText(
        content.additionalInfo,
        {
          businessId: content.businessId,
          source: 'business-additional-info',
          section: 'additional',
          title: 'Additional Information',
          category: 'general',
          lang
        },
        'general'
      );
      chunks.push(...additionalChunks);
    }

    return chunks;
  }
}

