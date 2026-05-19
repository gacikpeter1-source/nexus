/**
 * Team QR Code Component
 * Generates and displays QR codes for team join links
 */

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

interface TeamQRCodeProps {
  teamId: string;
  clubId: string;
  teamName: string;
  onClose: () => void;
}

export default function TeamQRCode({ teamId, clubId, teamName, onClose }: TeamQRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [downloadReady, setDownloadReady] = useState(false);

  const joinUrl = `${window.location.origin}/join-team?teamId=${teamId}&clubId=${clubId}`;

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, joinUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: '#FFFFFF',
          light: '#1A1F2E',
        },
      }, (error) => {
        if (error) {
          console.error('Error generating QR code:', error);
        } else {
          setDownloadReady(true);
        }
      });
    }
  }, [joinUrl]);

  const copyLink = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadQRCode = () => {
    if (canvasRef.current) {
      const link = document.createElement('a');
      link.download = `${teamName.replace(/\s+/g, '-').toLowerCase()}-qr-code.png`;
      link.href = canvasRef.current.toDataURL();
      link.click();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-app-card w-full max-w-md rounded-2xl border border-white/10 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div>
              <h2 className="text-lg font-bold text-text-primary">Team QR Code</h2>
              <p className="text-sm text-text-secondary">{teamName}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* QR Code */}
            <div className="bg-app-primary rounded-xl p-4 mb-4 flex justify-center">
              <canvas ref={canvasRef} />
            </div>

            {/* Description */}
            <p className="text-sm text-text-secondary mb-4 text-center">
              Scan this QR code or share the link to invite new members to join your team
            </p>

            {/* Link */}
            <div className="bg-app-secondary border border-white/10 rounded-lg p-3 mb-4">
              <p className="text-xs text-text-muted mb-1">Join Link</p>
              <p className="text-sm text-text-primary break-all font-mono">{joinUrl}</p>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={copyLink}
                className="flex-1 px-4 py-2.5 bg-app-secondary border border-white/10 text-white rounded-lg hover:bg-white/10 transition-all flex items-center justify-center gap-2"
              >
                {copied ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy Link
                  </>
                )}
              </button>
              <button
                onClick={downloadQRCode}
                disabled={!downloadReady}
                className="flex-1 px-4 py-2.5 bg-gradient-primary text-white rounded-lg hover:shadow-button-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download QR
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
