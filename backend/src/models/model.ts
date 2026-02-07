import mongoose from 'mongoose';

const modelSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: [true, 'Please provide a title for the model'] 
  },
  description: { 
    type: String, 
    default: 'Premium 3D Model' 
  },
  images: [{ 
    type: String // دي هتبقى للصور (jpg, png) بس
  }],
  model3d: { 
    type: String // ده المكان المخصص لملف الـ 3D (glb, gltf)
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

export const Model = mongoose.model('Model', modelSchema);