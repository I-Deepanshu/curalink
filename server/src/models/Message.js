import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  retrievedDocs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Document' }],
  retrievedTrials: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Trial' }],
  queryMeta: {
    expandedQuery: String,
    latencyMs: Number,
    llmModel: String,
  },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('Message', messageSchema);
