import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgpu';

export class DetectionService {
  constructor() {
    this.model = null;
    this.labels = [];
    this.config = null;
  }

  // Muat model dan metadata secara bersamaan, lalu simpan ke instance
  // Implementasikan strategi Backend Adaptive
  async loadModel(onProgress) {
    try {
      if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
        await tf.setBackend('webgpu');
        console.log('TFJS Backend set to WebGPU');
      } else {
        await tf.setBackend('webgl');
        console.log('TFJS Backend set to WebGL');
      }
    } catch (e) {
      console.warn('Failed to set preferred TFJS backend, trying fallback WebGL or CPU:', e);
      try {
        await tf.setBackend('webgl');
      } catch (err) {
        await tf.setBackend('cpu');
      }
    }
    
    await tf.ready();

    // Load model with progress tracking and metadata in parallel
    const [model, metadataRes] = await Promise.all([
      tf.loadLayersModel('/model/model.json', {
        onProgress: (fraction) => {
          if (onProgress) onProgress(fraction);
        }
      }),
      fetch('/model/metadata.json')
    ]);

    const metadata = await metadataRes.json();
    this.model = model;
    this.labels = metadata.labels;
    console.log('TFJS Model and metadata successfully loaded. Labels:', this.labels);
  }

  // Lakukan prediksi pada elemen gambar yang diberikan dan kembalikan hasilnya
  async predict(imageElement) {
    if (!this.isLoaded()) {
      throw new Error("Detection model is not loaded yet");
    }

    return tf.tidy(() => {
      // Ubah gambar menjadi Tensor
      const tensor = tf.browser.fromPixels(imageElement);
      
      // Teachable Machine image size is 224x224
      const resized = tf.image.resizeBilinear(tensor, [224, 224]);
      
      // Normalisasi piksel ke range [-1, 1] sesuai spesifikasi Teachable Machine
      // formula: (pixel / 127.5) - 1.0
      const normalized = tf.cast(resized, 'float32').div(tf.scalar(127.5)).sub(tf.scalar(1.0));
      
      // Tambahkan dimensi batch: [1, 224, 224, 3]
      const batched = normalized.expandDims(0);
      
      // Jalankan model prediksi
      const prediction = this.model.predict(batched);
      
      // Ambil skor output
      const scores = prediction.dataSync();
      
      // Temukan kelas dengan probabilitas tertinggi
      let maxScore = -1;
      let maxIndex = -1;
      for (let i = 0; i < scores.length; i++) {
        if (scores[i] > maxScore) {
          maxScore = scores[i];
          maxIndex = i;
        }
      }
      
      if (maxIndex === -1) {
        return null;
      }

      const className = this.labels[maxIndex];
      const confidence = maxScore * 100;
      
      return {
        className,
        score: maxScore,
        confidence,
        isValid: true
      };
    });
  }

  // Periksa apakah model sudah dimuat dan siap digunakan
  isLoaded() {
    return this.model !== null && this.labels.length > 0;
  }
}
