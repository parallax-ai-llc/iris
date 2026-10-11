/**
 * Capture thumbnail from preview video at time 0
 */
export async function capturePreviewThumbnail(): Promise<string | null> {
  // Find the preview video element
  const video = document.querySelector('[data-editor-preview-video]') as HTMLVideoElement;
  if (!video) {
    console.warn('Preview video element not found for thumbnail capture');
    return null;
  }

  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(null);
      return;
    }

    // Use video's natural dimensions, scaled down for thumbnail
    const maxWidth = 640;
    const maxHeight = 360;
    let width = video.videoWidth || 1920;
    let height = video.videoHeight || 1080;

    // Scale down if needed
    if (width > maxWidth) {
      height = (height * maxWidth) / width;
      width = maxWidth;
    }
    if (height > maxHeight) {
      width = (width * maxHeight) / height;
      height = maxHeight;
    }

    canvas.width = width;
    canvas.height = height;

    // Store original time
    const originalTime = video.currentTime;
    
    // Seek to start for thumbnail
    const captureFrame = () => {
      ctx.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      
      // Restore original time
      video.currentTime = originalTime;
      
      resolve(dataUrl);
    };

    // If video is at time 0 and has data, capture immediately
    if (video.readyState >= 2 && video.currentTime === 0) {
      captureFrame();
    } else {
      // Seek to 0 and capture
      const handleSeeked = () => {
        video.removeEventListener('seeked', handleSeeked);
        captureFrame();
      };
      
      video.addEventListener('seeked', handleSeeked);
      video.currentTime = 0;
      
      // Timeout fallback
      setTimeout(() => {
        video.removeEventListener('seeked', handleSeeked);
        if (video.readyState >= 2) {
          captureFrame();
        } else {
          resolve(null);
        }
      }, 2000);
    }
  });
}
