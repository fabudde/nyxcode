'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type * as L from 'leaflet';
import type { Place } from '@/components/VeganMap';

const VeganMap = dynamic(() => import('@/components/VeganMap'), { ssr: false });

interface Fav { id: number; name: string; lat: number; lon: number; }

export default function Home() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [query, setQuery] = useState('');
  const [onlyVegan, setOnlyVegan] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [favs, setFavs] = useState<Fav[]>([]);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => { setToken(localStorage.getItem('token')); }, []);

  const loadFavs = useCallback(async (tk: string) => {
    const r = await fetch('/api/favorites', { headers: { Authorization: 'Bearer ' + tk } });
    if (r.ok) setFavs(await r.json());
  }, []);

  useEffect(() => { if (token) loadFavs(token); }, [token, loadFavs]);

  const save = async (p: Place) => {
    if (!token) { location.href = '/login'; return; }
    const r = await fetch('/api/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ name: p.name, lat: p.lat, lon: p.lon }),
    });
    if (r.ok) loadFavs(token);
  };

  const locate = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition((pos) =>
      mapRef.current!.setView([pos.coords.latitude, pos.coords.longitude], 15),
    );
  };

  const logout = () => { localStorage.removeItem('token'); setToken(null); setFavs([]); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.8rem 1.2rem', background: 'rgba(11,20,16,0.92)', borderBottom: '1px solid rgba(52,211,153,0.18)', flexWrap: 'wrap', zIndex: 1000 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '1.25rem' }}>
          <span>🌱</span><span>Vegan</span><span style={{ color: '#34d399', marginLeft: '-0.35rem' }}>Maps</span>
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter visible places…"
          style={{ flex: 1, minWidth: 200, maxWidth: 420, padding: '0.6rem 0.9rem', borderRadius: 10, border: '1px solid rgba(52,211,153,0.22)', background: 'rgba(255,255,255,0.04)', color: '#eafff3', outline: 'none' }} />
        <button onClick={() => setOnlyVegan((v) => !v)} style={{ padding: '0.55rem 0.9rem', borderRadius: 10, border: '1px solid rgba(52,211,153,0.35)', background: 'rgba(52,211,153,0.14)', color: '#eafff3', fontWeight: 600, cursor: 'pointer' }}>
          {onlyVegan ? '🥗 Fully vegan' : '🌿 Vegan options'}
        </button>
        <button onClick={locate} style={{ padding: '0.55rem 0.9rem', borderRadius: 10, border: '1px solid rgba(163,230,53,0.4)', background: 'rgba(163,230,53,0.12)', color: '#eafff3', fontWeight: 600, cursor: 'pointer' }}>📍 Near me</button>
        {token ? (
          <>
            <span style={{ padding: '0.55rem 0.75rem', borderRadius: 10, border: '1px solid rgba(52,211,153,0.25)', color: '#34d399', fontWeight: 600, fontSize: '0.85rem' }}>🌱 Signed in</span>
            <button onClick={logout} style={{ padding: '0.55rem 0.9rem', borderRadius: 10, border: '1px solid rgba(251,113,133,0.4)', background: 'rgba(251,113,133,0.12)', color: '#fb7185', fontWeight: 600, cursor: 'pointer' }}>Sign out</button>
          </>
        ) : (
          <a href="/login" style={{ padding: '0.55rem 0.9rem', borderRadius: 10, border: '1px solid rgba(52,211,153,0.25)', color: '#9fe9c6', textDecoration: 'none', fontWeight: 600 }}>Sign in</a>
        )}
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <aside style={{ width: 340, maxWidth: '42vw', display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(52,211,153,0.15)', background: 'rgba(7,14,11,0.6)' }}>
          <div style={{ padding: '0.9rem 1.1rem', borderBottom: '1px solid rgba(52,211,153,0.12)', fontWeight: 700 }}>
            Results <span style={{ color: '#34d399' }}>{places.length}</span>
          </div>
          <div style={{ overflowY: 'auto', flex: 1, padding: '0.6rem' }}>
            {places.length === 0 ? (
              <div style={{ padding: '1.4rem 1rem', color: 'rgba(234,255,243,0.5)', textAlign: 'center', fontSize: '0.9rem' }}>Move the map to discover vegan places.</div>
            ) : places.map((p) => (
              <div key={p.id} className="vm-card" style={{ padding: '0.7rem 0.8rem', border: '1px solid rgba(52,211,153,0.14)', borderRadius: 12, marginBottom: '0.5rem' }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>{p.name}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#34d399', fontSize: '0.74rem', fontWeight: 600 }}>{p.diet}</span>
                  <button onClick={() => save(p)} style={{ background: 'none', border: '1px solid rgba(163,230,53,0.4)', color: '#a3e635', borderRadius: 8, padding: '2px 8px', fontSize: '0.74rem', cursor: 'pointer' }}>♥ Save</button>
                </div>
              </div>
            ))}
          </div>
          {token && (
            <div style={{ borderTop: '1px solid rgba(52,211,153,0.18)', maxHeight: '42%', overflowY: 'auto', padding: '0.7rem 0.8rem' }}>
              <div style={{ fontWeight: 700, color: '#a3e635', fontSize: '0.85rem', marginBottom: '0.5rem' }}>★ My favorites</div>
              {favs.length === 0 ? (
                <div style={{ color: 'rgba(234,255,243,0.5)', fontSize: '0.82rem', padding: '0.3rem' }}>No saved spots yet — tap ♥ Save on a place.</div>
              ) : favs.map((f) => (
                <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '0.4rem 0.5rem', border: '1px solid rgba(163,230,53,0.14)', borderRadius: 10, marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.84rem' }}>{f.name}</span>
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lon}`} target="_blank" style={{ color: '#a3e635', fontSize: '0.76rem', textDecoration: 'none' }}>↗ Map</a>
                </div>
              ))}
            </div>
          )}
        </aside>

        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <VeganMap strict={onlyVegan} query={query} onPlaces={setPlaces} onMapReady={(m) => { mapRef.current = m; }} />
        </div>
      </div>
    </div>
  );
}
