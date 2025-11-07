import mongoose, { Schema } from 'mongoose';

export interface IBusiness {
  _id?: string;
  name: string;
  pageId?: string;
  timezone: string;
  locale: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const BusinessSchema = new Schema<IBusiness>({
  name: {
    type: String,
    required: true,
    trim: true
  },
  pageId: {
    type: String,
    required: false,
    trim: true
  },
  timezone: {
    type: String,
    required: true,
    default: 'Asia/Yangon'
  },
  locale: {
    type: String,
    required: true,
    default: 'en'
  }
}, {
  timestamps: true,
  collection: 'businesses'
});

BusinessSchema.index({ pageId: 1 });

export const Business = mongoose.model<IBusiness>('Business', BusinessSchema);
export default Business;

