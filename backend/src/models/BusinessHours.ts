import mongoose, { Schema } from 'mongoose';

export interface IBusinessHours {
  _id?: string;
  businessId: string;
  weekday: number;
  open: string;
  close: string;
  isClosed: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const BusinessHoursSchema = new Schema<IBusinessHours>({
  businessId: {
    type: String,
    required: true,
    ref: 'Business'
  },
  weekday: {
    type: Number,
    required: true,
    min: 0,
    max: 6
  },
  open: {
    type: String,
    required: function(this: IBusinessHours) {
      return !this.isClosed;
    },
    match: /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/
  },
  close: {
    type: String,
    required: function(this: IBusinessHours) {
      return !this.isClosed;
    },
    match: /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/
  },
  isClosed: {
    type: Boolean,
    required: true,
    default: false
  }
}, {
  timestamps: true,
  collection: 'business_hours'
});

BusinessHoursSchema.index({ businessId: 1, weekday: 1 }, { unique: true });

export const BusinessHours = mongoose.model<IBusinessHours>('BusinessHours', BusinessHoursSchema);
export default BusinessHours;

