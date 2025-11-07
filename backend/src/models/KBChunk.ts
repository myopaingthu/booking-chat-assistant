import mongoose, { Schema } from 'mongoose';

export interface IKBChunk {
  _id?: string;
  businessId: string;
  source: string;
  text: string;
  embedding: number[];
  lang: string;
  metadata?: {
    section?: string;
    title?: string;
    category?: string;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const KBChunkSchema = new Schema<IKBChunk>({
  businessId: {
    type: String,
    required: true,
    ref: 'Business'
  },
  source: {
    type: String,
    required: true,
    trim: true
  },
  text: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 5000
  },
  embedding: {
    type: [Number],
    required: true,
    validate: {
      validator: function(arr: number[]) {
        return arr.length === 1024 || arr.length === 4096;
      },
      message: 'Embedding must have 1024 dimensions (Mistral API) or 4096 dimensions (Ollama)'
    }
  },
  lang: {
    type: String,
    required: true,
    default: 'en'
  },
  metadata: {
    section: {
      type: String,
      required: false
    },
    title: {
      type: String,
      required: false
    },
    category: {
      type: String,
      required: false
    }
  }
}, {
  timestamps: true,
  collection: 'kb_chunks'
});

KBChunkSchema.index({ businessId: 1 });
KBChunkSchema.index({ businessId: 1, lang: 1 });
KBChunkSchema.index({ 'metadata.section': 1 });
KBChunkSchema.index({ 
  embedding: "2dsphere" 
}, { 
  name: "kb_vector_index",
  background: true 
});

export const KBChunk = mongoose.model<IKBChunk>('KBChunk', KBChunkSchema);
export default KBChunk;

