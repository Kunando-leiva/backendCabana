import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect("mongodb+srv://Cabana:2025@cabana.m1r3x.mongodb.net/?retryWrites=true&w=majority&appName=cabana");
    console.log('MongoDB connected ;)');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

export default connectDB;

