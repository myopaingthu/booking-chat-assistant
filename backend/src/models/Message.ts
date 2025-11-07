import mongoose, { Schema } from 'mongoose';

export interface IMessage {
  _id?: string;
  businessId: string;
  threadId: string;
  from: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const MessageSchema = new Schema<IMessage>({
  businessId: {
    type: String,
    required: true,
    ref: 'Business'
  },
  threadId: {
    type: String,
    required: true
  },
  from: {
    type: String,
    required: true,
    enum: ['user', 'assistant']
  },
  text: {
    type: String,
    required: true,
    trim: true
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'messages'
});

MessageSchema.index({ businessId: 1, threadId: 1, timestamp: -1 });
MessageSchema.index({ threadId: 1 });

export const Message = mongoose.model<IMessage>('Message', MessageSchema);
export default Message;

