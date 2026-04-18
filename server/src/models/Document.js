import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
  source: { type: String, enum: ['openalex', 'pubmed'], required: true },
  externalId: { type: String, required: true },          // OpenAlex work ID or PMID
  title: { type: String, required: true },
  abstract: { type: String, default: '' },
  authors: [String],
  year: Number,
  journal: String,
  url: String,
  citationCount: { type: Number, default: 0 },
  embedding: [Number],                                    // float[] from nomic-embed-text
  fetchedAt: { type: Date, default: Date.now },
});

// Unique index to prevent duplicates; TTL 24 h
documentSchema.index({ source: 1, externalId: 1 }, { unique: true });
documentSchema.index({ fetchedAt: 1 }, { expireAfterSeconds: 86400 });

export default mongoose.model('Document', documentSchema);
