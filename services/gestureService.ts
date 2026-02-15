import { FilesetResolver, HandLandmarker, DrawingUtils } from "@mediapipe/tasks-vision";
import { GestureState } from "../types";

let handLandmarker: HandLandmarker | undefined;
let runningMode: "IMAGE" | "VIDEO" = "VIDEO";

export const initializeHandLandmarker = async () => {
  // Prevent re-initialization if already loaded
  if (handLandmarker) {
    console.log("HandLandmarker already initialized");
    return;
  }

  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
        delegate: "GPU"
      },
      runningMode: runningMode,
      numHands: 1
    });
    console.log("HandLandmarker initialized successfully");
  } catch (error) {
    console.error("Failed to initialize HandLandmarker:", error);
  }
};

export const detectGesture = (video: HTMLVideoElement): GestureState => {
  const defaultState: GestureState = { 
    x: 0, 
    y: 0, 
    isPinching: false, 
    isLeftClick: false,
    isRightClick: false,
    handDetected: false,
    fingerExtended: { thumb: false, index: false, middle: false, ring: false, pinky: false }
  };

  if (!handLandmarker) {
    return defaultState;
  }

  try {
    const startTimeMs = performance.now();
    const results = handLandmarker.detectForVideo(video, startTimeMs);

    if (results.landmarks && results.landmarks.length > 0) {
      const landmarks = results.landmarks[0];
      
      // Hand landmarks: 0=wrist, 4=thumb_tip, 8=index_tip, 12=middle_tip, 16=ring_tip, 20=pinky_tip
      // Base knuckles: 5=index_base, 9=middle_base, 13=ring_base, 17=pinky_base
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      const middleTip = landmarks[12];
      const ringTip = landmarks[16];
      const pinkyTip = landmarks[20];
      
      const thumbBase = landmarks[2];
      const indexBase = landmarks[5];
      const middleBase = landmarks[9];
      const ringBase = landmarks[13];
      const pinkyBase = landmarks[17];

      // Coordinates are normalized [0, 1]. Invert X for mirror effect.
      const x = 1 - indexTip.x;
      const y = indexTip.y;

      // Calculate distances
      const indexThumbDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
      const middleThumbDist = Math.hypot(middleTip.x - thumbTip.x, middleTip.y - thumbTip.y);
      
      // Detect finger extension (is fingertip far from base?)
      const isIndexExtended = Math.hypot(indexTip.x - indexBase.x, indexTip.y - indexBase.y) > 0.1;
      const isMiddleExtended = Math.hypot(middleTip.x - middleBase.x, middleTip.y - middleBase.y) > 0.1;
      const isRingExtended = Math.hypot(ringTip.x - ringBase.x, ringTip.y - ringBase.y) > 0.1;
      const isPinkyExtended = Math.hypot(pinkyTip.x - pinkyBase.x, pinkyTip.y - pinkyBase.y) > 0.1;
      const isThumbExtended = Math.hypot(thumbTip.x - thumbBase.x, thumbTip.y - thumbBase.y) > 0.08;

      // Gesture Detection:
      // Left Click = Index finger + Thumb pinch (middle finger extended)
      const isLeftClick = indexThumbDist < 0.06 && isMiddleExtended;
      
      // Right Click = Middle finger + Thumb pinch (index extended, not left clicking)
      const isRightClick = middleThumbDist < 0.06 && isIndexExtended && indexThumbDist > 0.08;
      
      // Generic pinch for backward compatibility
      const isPinching = isLeftClick || isRightClick;
      
      // Debug logging (remove in production)
      if (isLeftClick || isRightClick) {
        console.log('👆 Gesture detected:', isLeftClick ? 'LEFT' : 'RIGHT', 
                    'indexThumb:', indexThumbDist.toFixed(3), 
                    'middleThumb:', middleThumbDist.toFixed(3));
      }

      return {
        x,
        y,
        isPinching,
        isLeftClick,
        isRightClick,
        handDetected: true,
        fingerExtended: {
          thumb: isThumbExtended,
          index: isIndexExtended,
          middle: isMiddleExtended,
          ring: isRingExtended,
          pinky: isPinkyExtended
        }
      };
    }
  } catch (e) {
    // Suppress detection errors (often happens if video is not fully ready)
    // console.warn("Gesture detection error:", e);
  }

  return defaultState;
};