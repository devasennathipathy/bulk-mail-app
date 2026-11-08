import mongoose from 'mongoose';
import { STATUSES } from '../validation.js';

const deliverySchema = new mongoose.Schema(
  {
    email: { type: String, required: true },
    status: { type: String, enum: ['sent', 'failed', 'previewed'], required: true },
    messageId: String,
    error: String,
  },
  { _id: false },
);

const emailSchema = new mongoose.Schema(
  {
    requestId: { type: String, required: true, unique: true },
    subject: { type: String, required: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 50000 },
    recipients: { type: [String], required: true },
    status: { type: String, enum: STATUSES, required: true, default: 'sending' },
    mode: { type: String, enum: ['preview', 'smtp'], required: true },
    deliveries: [deliverySchema],
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    completedAt: Date,
  },
  { timestamps: true, versionKey: false },
);

emailSchema.index({ createdAt: -1 });
emailSchema.index({ status: 1, createdAt: -1 });

export const Email = mongoose.model('Email', emailSchema);
