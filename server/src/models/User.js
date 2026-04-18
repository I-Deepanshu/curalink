import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  disease: { type: String, trim: true },
  location: { type: String, trim: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('User', userSchema);
