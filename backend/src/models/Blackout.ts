import mongoose, { Schema } from 'mongoose';

export interface IBlackout {
  _id?: string;
  businessId: string;
  startDate: Date;
  endDate?: Date;
  reason: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const BlackoutSchema = new Schema<IBlackout>({
  businessId: {
    type: String,
    required: true,
    ref: 'Business'
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: false
  },
  reason: {
    type: String,
    required: true,
    trim: true
  }
}, {
  timestamps: true,
  collection: 'blackouts'
});

BlackoutSchema.index({ businessId: 1, startDate: 1, endDate: 1 });
BlackoutSchema.index({ businessId: 1 });

export const Blackout = mongoose.model<IBlackout>('Blackout', BlackoutSchema);
export default Blackout;

