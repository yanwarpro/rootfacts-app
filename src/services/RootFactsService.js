import { TONE_CONFIG } from '../utils/config.js';

const VEGETABLE_TRANSLATIONS = {
  Beetroot: 'Bit',
  Paprika: 'Paprika',
  Cabbage: 'Kubis',
  Carrot: 'Wortel',
  Cauliflower: 'Kembang Kol',
  Chilli: 'Cabai',
  Corn: 'Jagung',
  Cucumber: 'Mentimun',
  eggplant: 'Terong',
  Garlic: 'Bawang Putih',
  Ginger: 'Jahe',
  Lettuce: 'Selada',
  Onion: 'Bawang Merah',
  Peas: 'Kacang Polong',
  Potato: 'Kentang',
  Turnip: 'Lobak',
  Soybean: 'Kedelai',
  Spinach: 'Bayam'
};

const FALLBACK_FACTS = {
  Bit: 'Bit kaya akan nitrat alami yang dapat membantu menurunkan tekanan darah dan meningkatkan kinerja fisik.',
  Paprika: 'Paprika merah mengandung vitamin C hampir tiga kali lipat lebih banyak daripada buah jeruk.',
  Kubis: 'Kubis merupakan sumber vitamin K yang sangat baik, penting untuk pembekuan darah dan kesehatan tulang.',
  Wortel: 'Wortel kaya akan beta-karoten, yang diubah oleh tubuh menjadi vitamin A untuk mendukung kesehatan mata.',
  'Kembang Kol': 'Kembang kol mengandung senyawa glukosinolat yang membantu melindungi sel-sel tubuh dari kerusakan.',
  Cabai: 'Rasa pedas pada cabai disebabkan oleh kapsaisin, zat aktif yang dapat meredakan rasa sakit dan meningkatkan metabolisme.',
  Jagung: 'Jagung mengandung antioksidan lutein dan zeaxanthin yang sangat baik untuk kesehatan mata.',
  Mentimun: 'Mentimun terdiri dari sekitar 95% air, menjadikannya pilihan yang sangat baik untuk hidrasi tubuh.',
  Terong: 'Kulit terong kaya akan nasunin, antioksidan kuat yang melindungi membran sel otak.',
  'Bawang Putih': 'Bawang putih mengandung alisin, senyawa sulfur aktif yang memiliki sifat antibakteri alami.',
  Jahe: 'Jahe mengandung gingerol yang efektif meredakan mual, peradangan, dan nyeri otot.',
  Selada: 'Selada mengandung kadar air yang tinggi dan serat pangan yang sangat baik untuk pencernaan sehat.',
  'Bawang Merah': 'Bawang merah kaya akan kuersetin, antioksidan flavonoid yang membantu melawan peradangan.',
  'Kacang Polong': 'Kacang polong adalah salah satu sumber protein nabati terbaik dan kaya akan serat.',
  Kentang: 'Kentang mengandung kalium yang tinggi, bahkan lebih banyak daripada pisang, untuk mendukung otot.',
  Lobak: 'Lobak sangat rendah kalori tetapi kaya serat dan vitamin C yang mendukung kekebalan tubuh.',
  Kedelai: 'Kedelai adalah protein nabati lengkap yang mengandung semua asam amino esensial.',
  Bayam: 'Bayam terkenal kaya akan zat besi non-heme dan folat, sangat penting untuk sel darah merah.'
};

export class RootFactsService {
  constructor() {
    this.generator = null;
    this.isModelLoaded = false;
    this.isGenerating = false;
    this.config = null;
    this.currentBackend = 'fallback'; // Default fallback
    this.currentTone = TONE_CONFIG.defaultTone;
  }

  // Muat model dan inisialisasi pipeline text2text-generation secara lokal (Transformers.js)
  // Implementasikan strategi Backend Adaptive
  async loadModel(onProgress) {
    try {
      console.log('Mencoba memuat model offline Xenova/LaMini-Flan-T5-77M (Transformers.js)...');

      const { pipeline } = await import('@huggingface/transformers');
      // Tentukan device backend secara adaptif
      const device = (typeof navigator !== 'undefined' && 'gpu' in navigator) ? 'webgpu' : 'cpu';

      this.generator = await pipeline('text2text-generation', 'Xenova/LaMini-Flan-T5-77M', {
        device: device,
        progress_callback: (data) => {
          if (data.status === 'progress' && onProgress) {
            onProgress(data.progress / 100);
          } else if (data.status === 'ready' && onProgress) {
            onProgress(1.0);
          }
        }
      });
      this.currentBackend = 'transformers';
      this.isModelLoaded = true;
      console.log(`Transformers.js berhasil dimuat pada device: ${device}`);
    } catch (err) {
      console.warn('Gagal memuat Transformers.js (offline), beralih ke database fallback lokal:', err);
      // Fallback lokal selalu siap
      this.currentBackend = 'fallback';
      this.isModelLoaded = true;
      if (onProgress) onProgress(1.0);
    }
  }

  // Konfigurasi tone fakta yang dihasilkan
  setTone(tone) {
    if (TONE_CONFIG.availableTones.some((t) => t.value === tone)) {
      this.currentTone = tone;
      console.log(`Tone diatur ke: ${tone}`);
    }
  }

  // Lakukan prediksi / generasi fakta nutrisi berdasarkan nama sayuran secara lokal
  // Konfigurasikan parameter generasi berdasarkan kebutuhan
  // Implemenasikan parameter tone untuk mengatur nada fakta yang dihasilkan
  async generateFacts(vegetableName) {
    this.isGenerating = true;
    const nameIndo = VEGETABLE_TRANSLATIONS[vegetableName] || vegetableName;

    try {
      if (this.currentBackend === 'transformers' && this.generator) {
        try {
          let toneInstruction = '';
          if (this.currentTone === 'funny') {
            toneInstruction = 'funny and humorous';
          } else if (this.currentTone === 'professional') {
            toneInstruction = 'scientific and formal';
          } else if (this.currentTone === 'casual') {
            toneInstruction = 'casual and friendly';
          } else {
            toneInstruction = 'informative';
          }

          const prompt = `Write a short, ${toneInstruction} nutritional fun fact about ${vegetableName}. Keep it to 1 sentence.`;

          // Konfigurasi parameter generasi lokal untuk menjaga performa
          const output = await this.generator(prompt, {
            max_new_tokens: 150,
            temperature: 0.7,
            top_p: 0.9,
            do_sample: true
          });
          const generatedText = output[0]?.generated_text || '';
          console.log('Transformers.js output:', generatedText);

          if (generatedText) {
            this.isGenerating = false;
            return generatedText;
          }
        } catch (transErr) {
          console.warn('Local Transformers.js generation failed, falling back to database:', transErr);
        }
      }

      // Fallback lokal database
      const baseFact = FALLBACK_FACTS[nameIndo] || `Nutrisi di dalam ${nameIndo} sangat baik untuk tubuh Anda.`;
      let formattedFact = baseFact;

      if (this.currentTone === 'funny') {
        formattedFact = `Eits, tahu tidak? ${baseFact} Keren banget kan! Jangan lupa dimakan ya! 🥦🤖`;
      } else if (this.currentTone === 'professional') {
        formattedFact = `Berdasarkan analisis nutrisi klinis: ${baseFact} Hal ini memberikan kontribusi signifikan bagi homeostasis tubuh secara berkelanjutan.`;
      } else if (this.currentTone === 'casual') {
        formattedFact = `Ternyata, ${baseFact.charAt(0).toLowerCase() + baseFact.slice(1)} lho! Bagus banget buat asupan harian kamu.`;
      }

      this.isGenerating = false;
      return formattedFact;

    } catch (error) {
      console.error('Error saat generasi fakta:', error);
      this.isGenerating = false;
      throw error;
    }
  }

  // Periksa apakah model sudah dimuat dan siap digunakan
  isReady() {
    return this.isModelLoaded;
  }
}
