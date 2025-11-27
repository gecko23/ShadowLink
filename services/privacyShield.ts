/**
 * Privacy Shield Service
 * Handles blocking of WebRTC and other potential IP leak vectors.
 */

let realRTCPeerConnection: any = null;
let realRTCSessionDescription: any = null;
let realRTCIceCandidate: any = null;

const STORAGE_KEY = 'shadowlink_webrtc_shield';

export const initPrivacyShield = () => {
  // Store the real constructors if they exist and haven't been stored yet
  if (typeof window !== 'undefined') {
    if (!realRTCPeerConnection) {
      realRTCPeerConnection = (window as any).RTCPeerConnection || 
                              (window as any).webkitRTCPeerConnection || 
                              (window as any).mozRTCPeerConnection;
    }
    if (!realRTCSessionDescription) {
      realRTCSessionDescription = window.RTCSessionDescription;
    }
    if (!realRTCIceCandidate) {
      realRTCIceCandidate = window.RTCIceCandidate;
    }

    // Check storage and apply
    const shouldBlock = localStorage.getItem(STORAGE_KEY) === 'true';
    if (shouldBlock) {
      enableWebRTCShield();
    }
  }
};

export const enableWebRTCShield = () => {
  if (typeof window === 'undefined') return;

  console.log("%c[ShadowLink] Privacy Shield: ACTIVATED (WebRTC Blocked)", "color: #00dc82; font-weight: bold;");
  
  // Override global WebRTC constructors to throw errors or do nothing
  const blockedConstructor = function() {
    console.warn("[ShadowLink] RTCPeerConnection creation blocked by Privacy Shield.");
    throw new Error("WebRTC is disabled by ShadowLink Privacy Shield to prevent IP leaks.");
  };

  (window as any).RTCPeerConnection = blockedConstructor;
  (window as any).webkitRTCPeerConnection = blockedConstructor;
  (window as any).mozRTCPeerConnection = blockedConstructor;

  localStorage.setItem(STORAGE_KEY, 'true');
};

export const disableWebRTCShield = () => {
  if (typeof window === 'undefined') return;

  console.log("%c[ShadowLink] Privacy Shield: DEACTIVATED (WebRTC Restored)", "color: #f43f5e; font-weight: bold;");

  // Restore original constructors
  if (realRTCPeerConnection) {
    (window as any).RTCPeerConnection = realRTCPeerConnection;
    (window as any).webkitRTCPeerConnection = realRTCPeerConnection;
    (window as any).mozRTCPeerConnection = realRTCPeerConnection;
  }
  
  localStorage.setItem(STORAGE_KEY, 'false');
};

export const getWebRTCShieldStatus = (): boolean => {
  return localStorage.getItem(STORAGE_KEY) === 'true';
};
