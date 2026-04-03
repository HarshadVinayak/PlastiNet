import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    name: { type: String },
    points: { type: Number, default: 0 },
    totalScans: { type: Number, default: 0 }
});

const User = mongoose.model('User', userSchema);
export default User;