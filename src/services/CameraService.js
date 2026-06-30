export class CameraService {
  constructor() {
    this.stream = null;
    this.video = null;
    this.canvas = null;
    this.selectedCameraType = 'default';
    this.fps = 30;
  }

  setVideoElement(videoElement) {
    this.video = videoElement;
  }

  setCanvasElement(canvasElement) {
    this.canvas = canvasElement;
  }

  // Dapatkan daftar perangkat input video
  async loadCameras() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      console.warn("Media devices API not supported in this browser.");
      return [];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'videoinput');
    } catch (error) {
      console.error("Error enumerating cameras:", error);
      return [];
    }
  }

  // Memulai kamera dengan tipe camera yang dipilih (front / default/back)
  async startCamera(selectedCameraType = 'default') {
    this.selectedCameraType = selectedCameraType;
    this.stopCamera();

    const facingMode = this.selectedCameraType === 'front' ? 'user' : 'environment';
    const constraints = {
      video: {
        facingMode: facingMode,
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: this.fps }
      },
      audio: false
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (this.video) {
        this.video.srcObject = this.stream;
        await new Promise((resolve) => {
          this.video.onloadedmetadata = () => {
            resolve();
          };
        });
      }
      return this.stream;
    } catch (error) {
      console.error("Error starting camera feed:", error);
      throw error;
    }
  }

  // Menghentikan siaran kamera dan membersihkan sumber daya
  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
    }
  }

  // Mengatur FPS kamera secara dinamis
  setFPS(fps) {
    this.fps = Number(fps);
    if (this.stream) {
      const videoTrack = this.stream.getVideoTracks()[0];
      if (videoTrack && videoTrack.applyConstraints) {
        videoTrack.applyConstraints({
          frameRate: { ideal: this.fps }
        }).catch(err => {
          console.warn("Could not apply FPS constraint dynamically:", err);
        });
      }
    }
  }

  // Periksa apakah kamera sedang aktif
  isActive() {
    return !!this.stream;
  }

  // Periksa apakah elemen video siap untuk digunakan
  isReady() {
    return this.video && this.video.readyState >= 3;
  }
}