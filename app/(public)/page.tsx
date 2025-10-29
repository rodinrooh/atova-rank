"use client";

import { useState, useEffect } from "react";

// ---- Color utils: normalize, parse, darken by % ----
const normalizeHex = (hex?: string, fallback = '#FF0000'): string => {
  if (!hex) return fallback;
  let h = hex.trim();
  if (!h.startsWith('#')) h = `#${h}`;
  // Expand 3-digit hex to 6-digit
  if (/^#([A-Fa-f0-9]{3})$/.test(h)) {
    const r = h[1], g = h[2], b = h[3];
    h = `#${r}${r}${g}${g}${b}${b}`;
  }
  // Validate 6-digit hex
  if (!/^#([A-Fa-f0-9]{6})$/.test(h)) return fallback;
  return h.toUpperCase();
};

const hexToRgb = (hex: string) => {
  const h = normalizeHex(hex);
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
};

const rgbToHex = (r: number, g: number, b: number) => {
  const toHex = (v: number) => {
    const x = Math.max(0, Math.min(255, Math.round(v)));
    return x.toString(16).toUpperCase().padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

/**
 * Lighten a hex color by a fraction (0.25 = 25% lighter).
 * Uses simple RGB multiplication (preserves hue, cross-browser safe).
 */
const lightenHex = (hex: string, fraction = 0.25) => {
  const { r, g, b } = hexToRgb(hex);
  const f = 1 + fraction; // e.g., 1.25
  return rgbToHex(r * f, g * f, b * f);
};

export default function TestPage() {
  const [timeRemaining, setTimeRemaining] = useState("00:00:00");
  const [matchup, setMatchup] = useState<any>(null);
  const [hoveredBox, setHoveredBox] = useState<string | null>(null);
  const [pressedBox, setPressedBox] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [showVotedModal, setShowVotedModal] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load current matchup
        const currentResponse = await fetch('/api/current-matchup');
        if (currentResponse.ok) {
          const currentJson = await currentResponse.json();
          console.log('Current matchup API response:', currentJson);
          
          if (currentJson?.matchup) {
            setMatchup(currentJson.matchup);
            setHasVoted(currentJson.hasVoted || false);
            
            // Try different possible expiry field names
            const expiry = currentJson?.matchup?.ends_at || 
                          currentJson?.matchup?.endsAt || 
                          currentJson?.matchup?.expiryTime || 
                          currentJson?.matchup?.expires_at;
            
            if (expiry) {
              const target = new Date(expiry);
              console.log('Target time:', target);
              
              const pad = (n: number) => n.toString().padStart(2, "0");
              const tick = () => {
                const diff = target.getTime() - Date.now();
                const clamped = Math.max(0, diff);
                const h = Math.floor(clamped / (1000 * 60 * 60));
                const m = Math.floor((clamped / (1000 * 60)) % 60);
                const s = Math.floor((clamped / 1000) % 60);
                setTimeRemaining(`${pad(h)}:${pad(m)}:${pad(s)}`);
              };
              tick();
              const id = setInterval(tick, 1000);
              return () => clearInterval(id);
            }
          }
        }

      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Compute normalized colors and darker border colors
  const vcAColor = normalizeHex(
    matchup?.vcA?.colorHex ?? matchup?.vc_a?.colorHex ?? '#FF0000'
  );
  const vcABorderColor = lightenHex(vcAColor, 0.10);

  const vcBColor = normalizeHex(
    matchup?.vcB?.colorHex ?? matchup?.vc_b?.colorHex ?? '#FF0000'
  );
  const vcBBorderColor = lightenHex(vcBColor, 0.10);


  // Calculate vote percentages
  const vcAVotes = matchup?.vcA?.currentCp || matchup?.vc_a?.currentCp || 0;
  const vcBVotes = matchup?.vcB?.currentCp || matchup?.vc_b?.currentCp || 0;
  const totalVotes = vcAVotes + vcBVotes;
  const vcAPercentage = totalVotes > 0 ? (vcAVotes / totalVotes) * 100 : 50;
  const vcBPercentage = totalVotes > 0 ? (vcBVotes / totalVotes) * 100 : 50;

  // Voting function
  const handleVote = async (vcId: string) => {
    if (!matchup || hasVoted || voting) {
      if (hasVoted) {
        setShowVotedModal(true);
      }
      return;
    }
    
    setVoting(vcId);
    try {
      const response = await fetch('/api/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          matchupId: matchup.id,
          vcId: vcId
        })
      });
      
      const result = await response.json();
      
      if (result.ok) {
        setHasVoted(true);
        // Update the matchup with new CP values
        setMatchup((prev: any) => ({
          ...prev,
          vcA: {
            ...prev.vcA,
            currentCp: vcId === prev.vcA.id ? result.newCp : prev.vcA.currentCp
          },
          vcB: {
            ...prev.vcB,
            currentCp: vcId === prev.vcB.id ? result.newCp : prev.vcB.currentCp
          }
        }));
      } else {
        console.error('Vote failed:', result.code);
        // Handle different error cases
        if (result.code === 'AlreadyVoted') {
          setHasVoted(true);
          setShowVotedModal(true);
        }
      }
    } catch (error) {
      console.error('Vote error:', error);
    } finally {
      setVoting(null);
    }
  };

  // Close modal function
  const closeModal = () => {
    setShowVotedModal(false);
  };

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    };
    
    if (showVotedModal) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [showVotedModal]);

  // Calculate scale based on hover and press states
  const getBoxScale = (boxId: string) => {
    let scale = 1;
    if (hoveredBox === boxId) scale *= 1.02; // 2% larger on hover
    if (pressedBox === boxId) scale *= 0.975; // 2.5% smaller when pressed
    return scale;
  };

  // Show skeleton loading state
  if (loading) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ 
          fontFamily: 'Inter', 
          fontWeight: 'bold', 
          fontSize: '120px', 
          letterSpacing: '-0.1em', 
          lineHeight: '1.15',
          color: '#e5e5e5'
        }}>
          --:--:--
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ 
              width: '398px', 
              height: '272px', 
              backgroundColor: '#f0f0f0', 
              borderRadius: '10px',
              border: '4px solid #e0e0e0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#c0c0c0',
              fontSize: '40px',
              fontWeight: 'bold',
              fontFamily: 'Inter',
              letterSpacing: '-0.1em',
              textTransform: 'uppercase'
            }}>
              LOADING...
            </div>
            <div style={{
              color: '#c0c0c0',
              fontWeight: 'bold',
              fontSize: '24px',
              letterSpacing: '-0.07em',
              marginTop: '10px',
              fontFamily: 'Inter'
            }}>
              --
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ 
              width: '398px', 
              height: '272px', 
              backgroundColor: '#f0f0f0', 
              borderRadius: '10px',
              border: '4px solid #e0e0e0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#c0c0c0',
              fontSize: '40px',
              fontWeight: 'bold',
              fontFamily: 'Inter',
              letterSpacing: '-0.1em',
              textTransform: 'uppercase'
            }}>
              LOADING...
            </div>
            <div style={{
              color: '#c0c0c0',
              fontWeight: 'bold',
              fontSize: '24px',
              letterSpacing: '-0.07em',
              marginTop: '10px',
              fontFamily: 'Inter'
            }}>
              --
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'Inter', fontWeight: 'bold', fontSize: '120px', letterSpacing: '-0.1em', lineHeight: '1.15' }}>{timeRemaining}</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div 
            style={{ 
              width: '398px', 
              height: '272px', 
              backgroundColor: vcAColor, 
              borderRadius: '10px',
              border: `4px solid ${vcABorderColor}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '40px',
              fontWeight: 'bold',
              fontFamily: 'Inter',
              letterSpacing: '-0.1em',
              textTransform: 'uppercase',
              transform: `scale(${getBoxScale('vcA')})`,
              transition: 'transform 0.1s ease',
              cursor: 'pointer'
            }}
            onMouseEnter={() => setHoveredBox('vcA')}
            onMouseLeave={() => {
              setHoveredBox(null);
              setPressedBox(null);
            }}
            onMouseDown={() => setPressedBox('vcA')}
            onMouseUp={() => setPressedBox(null)}
            onClick={() => handleVote(matchup?.vcA?.id || matchup?.vc_a?.id)}
          >
            {matchup?.vcA?.name || matchup?.vc_a?.name || 'VC A'}
          </div>
          <div style={{
            color: 'black',
            fontWeight: 'bold',
            fontSize: '24px',
            letterSpacing: '-0.07em',
            marginTop: '10px',
            fontFamily: 'Inter'
          }}>
            {matchup?.vcA?.currentCp || matchup?.vc_a?.currentCp || '0'}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div 
            style={{ 
              width: '398px', 
              height: '272px', 
              backgroundColor: vcBColor, 
              borderRadius: '10px',
              border: `4px solid ${vcBBorderColor}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '40px',
              fontWeight: 'bold',
              fontFamily: 'Inter',
              letterSpacing: '-0.1em',
              textTransform: 'uppercase',
              transform: `scale(${getBoxScale('vcB')})`,
              transition: 'transform 0.1s ease',
              cursor: 'pointer'
            }}
            onMouseEnter={() => setHoveredBox('vcB')}
            onMouseLeave={() => {
              setHoveredBox(null);
              setPressedBox(null);
            }}
            onMouseDown={() => setPressedBox('vcB')}
            onMouseUp={() => setPressedBox(null)}
            onClick={() => handleVote(matchup?.vcB?.id || matchup?.vc_b?.id)}
          >
            {matchup?.vcB?.name || matchup?.vc_b?.name || 'VC B'}
          </div>
          <div style={{
            color: 'black',
            fontWeight: 'bold',
            fontSize: '24px',
            letterSpacing: '-0.07em',
            marginTop: '10px',
            fontFamily: 'Inter'
          }}>
            {matchup?.vcB?.currentCp || matchup?.vc_b?.currentCp || '0'}
          </div>
        </div>
      </div>
      
      {/* Vote percentage bar */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        marginTop: '20px',
        width: '100%'
      }}>
        <div style={{ 
          width: '1200px', // Much wider than the boxes
          height: '40px',
          borderRadius: '20px',
          overflow: 'hidden',
          position: 'relative',
          display: 'flex'
        }}>
          {/* VC A section */}
          <div style={{
            width: `${vcAPercentage}%`,
            height: '100%',
            backgroundColor: vcAColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: '20px'
          }}>
            <span style={{
              color: 'white',
              fontWeight: 'bold',
              fontSize: '18px',
              fontFamily: 'Inter',
              letterSpacing: '-0.05em'
            }}>
              {Math.round(vcAPercentage)}%
            </span>
          </div>
          
          {/* VC B section */}
          <div style={{
            width: `${vcBPercentage}%`,
            height: '100%',
            backgroundColor: vcBColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            paddingLeft: '20px'
          }}>
            <span style={{
              color: 'white',
              fontWeight: 'bold',
              fontSize: '18px',
              fontFamily: 'Inter',
              letterSpacing: '-0.05em'
            }}>
              {Math.round(vcBPercentage)}%
            </span>
          </div>
        </div>
      </div>
      
      
      {/* Voted Modal */}
      {showVotedModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={closeModal}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '32px',
              maxWidth: '400px',
              width: '90%',
              position: 'relative',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close X button */}
            <button
              onClick={closeModal}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                color: '#666',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              ×
            </button>
            
            {/* Modal content */}
            <div style={{ textAlign: 'center' }}>
              <h2 style={{
                fontSize: '24px',
                fontWeight: 'bold',
                fontFamily: 'Inter',
                marginBottom: '16px',
                color: '#333'
              }}>
                You Already Voted!
              </h2>
              
              <p style={{
                fontSize: '16px',
                color: '#666',
                lineHeight: '1.5',
                marginBottom: '24px',
                fontFamily: 'Inter'
              }}>
                Come back for the next matchup! Stick around and watch to see how this one turns out.
              </p>
              
              <button
                onClick={closeModal}
                style={{
                  backgroundColor: '#000',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px 24px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  fontFamily: 'Inter',
                  cursor: 'pointer',
                  letterSpacing: '-0.02em'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#333'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#000'}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}