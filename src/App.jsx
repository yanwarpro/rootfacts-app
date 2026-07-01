import { useRef, useState, useEffect } from 'react';
import Header from './components/Header';
import CameraSection from './components/CameraSection';
import InfoPanel from './components/InfoPanel';
import { useAppState } from './hooks/useAppState';
import { CameraService } from './services/CameraService';
import { DetectionService } from './services/DetectionService';
import { RootFactsService } from './services/RootFactsService';
import { APP_CONFIG, isValidDetection } from './utils/config';
import { createDelay } from './utils/common';

function App() {
  const { state, actions } = useAppState();
  const detectionCleanupRef = useRef(null);
  const isRunningRef = useRef(false);
  const [currentTone, setCurrentTone] = useState('normal');
  const [copySuccess, setCopySuccess] = useState(false);

  // Inisialisasi layanan deteksi, kamera, dan generator fakta saat aplikasi dimuat
  useEffect(() => {
    const detector = new DetectionService();
    const camera = new CameraService();
    const generator = new RootFactsService();

    actions.setServices({ detector, camera, generator });

    let tfProgress = 0;
    let genAIProgress = 0;

    const updateStatus = () => {
      const avg = Math.round((tfProgress + genAIProgress) / 2);
      actions.setModelStatus(`Memuat Model AI... (${avg}%)`);
    };

    const loadAllModels = async () => {
      try {
        actions.setModelStatus('Memuat Model AI... (0%)');

        await Promise.all([
          detector.loadModel((fraction) => {
            tfProgress = Math.round(fraction * 100);
            updateStatus();
          }),
          generator.loadModel((fraction) => {
            genAIProgress = Math.round(fraction * 100);
            updateStatus();
          })
        ]);

        actions.setModelStatus('Model AI Siap');
      } catch (err) {
        console.error('Error loading models:', err);
        actions.setModelStatus('Gagal Memuat Model');
        actions.setError('Gagal memuat model klasifikasi atau modul AI.');
      }
    };

    loadAllModels();

    return () => {
      camera.stopCamera();
    };
  }, []);

  // Bersihkan sumber daya saat komponen ditinggalkan
  useEffect(() => {
    return () => {
      if (state.services.camera) {
        state.services.camera.stopCamera();
      }
    };
  }, [state.services.camera]);

  // Fungsi untuk memulai loop deteksi
  const startDetectionLoop = () => {
    const loop = async () => {
      if (!isRunningRef.current) return;

      const { detector, camera, generator } = state.services;

      if (camera && camera.isReady() && detector && detector.isLoaded()) {
        try {
          const result = await detector.predict(camera.video);

          if (isValidDetection(result)) {
            // Stop scanning once detected successfully
            isRunningRef.current = false;
            actions.setRunning(false);
            camera.stopCamera();

            // Show analyzing state
            actions.setAppState('analyzing');
            actions.setDetectionResult(result);

            // Fake analyzing delay (delaying 2000ms as configured in APP_CONFIG)
            await createDelay(APP_CONFIG.analyzingDelay);

            // Show results
            actions.setAppState('result');
            actions.setFunFactData(null); // start loading facts

            // Call generator
            try {
              const fact = await generator.generateFacts(result.className);
              actions.setFunFactData(fact);
            } catch (genErr) {
              console.error('Error generating nutritional fact:', genErr);
              actions.setFunFactData('error');
            }
            return; // stop looping
          }
        } catch (err) {
          console.error('Error in prediction loop:', err);
        }
      }

      if (isRunningRef.current) {
        const retryInterval = APP_CONFIG.detectionRetryInterval || 100;
        setTimeout(loop, retryInterval);
      }
    };

    loop();
  };

  // Fungsi untuk memulai dan menghentikan kamera
  const toggleCamera = async (cameraType = 'default') => {
    const { camera } = state.services;
    if (!camera) return;

    if (state.isRunning) {
      // Turn off
      isRunningRef.current = false;
      actions.setRunning(false);
      camera.stopCamera();
      actions.resetResults();
    } else {
      // Turn on
      try {
        actions.resetResults();
        await camera.startCamera(cameraType);

        isRunningRef.current = true;
        actions.setRunning(true);

        // Jeda sejenak agar stream kamera tampil di layar sebelum pemrosesan model dimulai
        await createDelay(APP_CONFIG.cameraDelay || 2000);

        if (isRunningRef.current) {
          startDetectionLoop();
        }
      } catch (err) {
        console.error('Failed to open camera:', err);
        actions.setError('Gagal mengakses kamera. Harap beri izin akses kamera.');
        actions.setRunning(false);
        isRunningRef.current = false;
      }
    }
  };

  // Fungsi untuk mengubah nada fakta yang dihasilkan
  const handleToneChange = async (newTone) => {
    setCurrentTone(newTone);
    const { generator } = state.services;
    if (generator) {
      generator.setTone(newTone);

      if (state.appState === 'result' && state.detectionResult) {
        actions.setFunFactData(null);
        try {
          const fact = await generator.generateFacts(state.detectionResult.className);
          actions.setFunFactData(fact);
        } catch (genErr) {
          console.error('Error generating nutritional fact:', genErr);
          actions.setFunFactData('error');
        }
      }
    }
  };

  // Fungsi untuk menyalin fakta ke clipboard
  const copyFactToClipboard = async () => {
    if (state.funFactData && state.funFactData !== 'error') {
      try {
        await navigator.clipboard.writeText(state.funFactData);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch (err) {
        console.error('Failed to copy to clipboard:', err);
      }
    }
  };

  return (
    <div className="app-container">
      <Header modelStatus={state.modelStatus} />

      <main className="main-content">
        <CameraSection
          isRunning={state.isRunning}
          onToggleCamera={toggleCamera}
          onToneChange={handleToneChange}
          services={state.services}
          modelStatus={state.modelStatus}
          error={state.error}
          currentTone={currentTone}
        />

        <InfoPanel
          appState={state.appState}
          detectionResult={state.detectionResult}
          funFactData={state.funFactData}
          error={state.error}
          onCopyFact={copyFactToClipboard}
        />
      </main>

      <footer className="footer">
        <p>Powered by TensorFlow.js & Transformers.js</p>
      </footer>

      {copySuccess && (
        <div style={{
          position: 'fixed',
          bottom: '1rem',
          left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: '380px',
          padding: '0.875rem 1rem',
          background: '#ecfdf5',
          border: '1px solid #a7f3d0',
          borderRadius: 'var(--radius-md)',
          color: '#065f46',
          fontSize: '0.8125rem',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          zIndex: 1000
        }}>
          <strong>Sukses:</strong> Fakta nutrisi disalin ke clipboard!
        </div>
      )}

      {state.error && (
        <div style={{
          position: 'fixed',
          bottom: '1rem',
          left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: '380px',
          padding: '0.875rem 1rem',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 'var(--radius-md)',
          color: '#991b1b',
          fontSize: '0.8125rem',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          zIndex: 1000
        }}>
          <strong>Error:</strong> {state.error}
          <button
            onClick={() => actions.setError(null)}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              fontSize: '1.25rem',
              cursor: 'pointer',
              color: '#991b1b',
              padding: 0,
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
