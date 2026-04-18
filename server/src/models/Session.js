import mongoose from 'mongoose';

const contextEntitySchema = new mongoose.Schema({
  type: { type: String, enum: ['disease', 'intent', 'location', 'drug', 'gene'], required: true },
  value: { type: String, required: true },
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  contextEntities: [contextEntitySchema],
  messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

sessionSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model('Session', sessionSchema);
