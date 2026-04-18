import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema({
  facility: String,
  city: String,
  state: String,
  country: String,
  zip: String,
}, { _id: false });

const contactSchema = new mongoose.Schema({
  name: String,
  phone: String,
  email: String,
}, { _id: false });

const trialSchema = new mongoose.Schema({
  nctId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  status: { type: String },                                // RECRUITING, ACTIVE_NOT_RECRUITING …
  phase: String,
  eligibility: {
    criteria: String,                                      // raw eligibility text
    minAge: String,
    maxAge: String,
    sex: String,
  },
  locations: [locationSchema],
  contacts: [contactSchema],
  conditions: [String],
  interventions: [String],
  url: String,
  fetchedAt: { type: Date, default: Date.now },
});

trialSchema.index({ fetchedAt: 1 }, { expireAfterSeconds: 86400 });

export default mongoose.model('Trial', trialSchema);
