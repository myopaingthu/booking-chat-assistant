import mongoose, { Schema } from 'mongoose';

export interface IService {
  _id?: string;
  businessId: string;
  name: string;
  durationMin: number;
  bufferMin: number;
  enabled: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const ServiceSchema = new Schema<IService>({
  businessId: {
    type: String,
    required: true,
    ref: 'Business'
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  durationMin: {
    type: Number,
    required: true,
    min: 15
  },
  bufferMin: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  enabled: {
    type: Boolean,
    required: true,
    default: true
  }
}, {
  timestamps: true,
  collection: 'services'
});

ServiceSchema.index({ businessId: 1 });
ServiceSchema.index({ businessId: 1, enabled: 1 });

export const Service = mongoose.model<IService>('Service', ServiceSchema);
export default Service;

