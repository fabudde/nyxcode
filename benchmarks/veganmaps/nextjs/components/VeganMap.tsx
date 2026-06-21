'use client';
import { useEffect, useRef } from 'react';
import type * as L from 'leaflet';

export interface Place {
  id: string;
  lat: number;
  lon: number;
  name: string;
  cuisine: string;
  address: string;
  hours: string;
  website: string;
  phone: string;
  diet: string;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

function normalize(els: any[]): Place[] {
  const seen: Record<string, boolean> = {};
  const out: Place[] = [];
  for (const e of els || []) {
    const lat = e.lat != null ? e.lat : e.center?.lat;
    const lon = e.lon != null ? e.lon : e.center?.lon;
    if (lat == null || lon == null) continue;
    const t = e.tags || {};
    if (!t.name) continue;
    const k = `${e.type}/${e.id}`;
    if (seen[k]) continue;
    seen[k] = true;
    const addr: string[] = [];
    if (t['addr:street']) addr.push(t['addr:street'] + (t['addr:housenumber'] ? ' ' + t['addr:housenumber'] : ''));
    if (t['addr:city']) addr.push(t['addr:city']);
    out.push({
      id: k, lat, lon, name: t.name,
      cuisine: (t.cuisine || '').replace(/;/g, ', '),
      address: addr.join(', '), hours: t.opening_hours || '',
      website: t.website || t['contact:website'] || '',
      phone: t.phone || t['contact:phone'] || '',
      diet: t['diet:vegan'] === 'only' ? '100% vegan' : 'vegan options',
    });
  }
  return out;
}

function popupHtml(p: Place): string {
  const dir = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`;
  return (
    `<h3 style="font-weight:700;margin-bottom:3px">${esc(p.name)}</h3>` +
    `<p style="color:#34d399;font-size:.74rem;font-weight:600">${esc(p.diet)}</p>` +
    (p.cuisine ? `<p style="color:#9fe9c6;font-size:.8rem">${esc(p.cuisine)}</p>` : '') +
    (p.address ? `<p style="color:rgba(234,255,243,.6);font-size:.78rem">${esc(p.address)}</p>` : '') +
    `<a href="${esc(dir)}" target="_blank" style="color:#34d399;font-weight:600;font-size:.82rem;text-decoration:none">↗ Directions</a>`
  );
}

export default function VeganMap({
  strict, query, onPlaces, onMapReady,
}: {
  strict: boolean;
  query: string;
  onPlaces: (p: Place[]) => void;
  onMapReady: (m: L.Map) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const allRef = useRef<Place[]>([]);
  const LRef = useRef<typeof L | null>(null);
  const strictRef = useRef(strict);
  const queryRef = useRef(query);

  useEffect(() => { strictRef.current = strict; }, [strict]);
  useEffect(() => { queryRef.current = query; }, [query]);

  const render = () => {
    const Lmod = LRef.current!, layer = layerRef.current!;
    const q = queryRef.current.toLowerCase();
    const shown = allRef.current.filter((p) => !q || p.name.toLowerCase().includes(q));
    layer.clearLayers();
    const icon = Lmod.divIcon({
      className: '',
      html: '<div style="font-size:26px;line-height:26px">🌱</div>',
      iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -24],
    });
    for (const p of shown) {
      Lmod.marker([p.lat, p.lon], { icon }).bindPopup(popupHtml(p)).addTo(layer);
    }
    onPlaces(shown);
  };

  const lastKey = useRef('');
  const load = async () => {
    const map = mapRef.current!;
    const b = map.getBounds();
    const bbox = `${b.getSouth().toFixed(4)},${b.getWest().toFixed(4)},${b.getNorth().toFixed(4)},${b.getEast().toFixed(4)}`;
    const filter = strictRef.current ? '"diet:vegan"="only"' : '"diet:vegan"~"yes|only"';
    const key = filter + '|' + bbox;
    if (key === lastKey.current) return;
    lastKey.current = key;
    const q = `[out:json][timeout:25];(nwr[${filter}](${bbox}););out center tags 200;`;
    try {
      const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q) });
      const d = await r.json();
      allRef.current = normalize(d.elements);
      render();
    } catch { /* ignore */ }
  };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    (async () => {
      const Lmod = (await import('leaflet')).default;
      LRef.current = Lmod;
      if (!containerRef.current || mapRef.current) return;
      const map = Lmod.map(containerRef.current).setView([52.52, 13.405], 14);
      Lmod.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      layerRef.current = Lmod.layerGroup().addTo(map);
      map.on('moveend', () => { clearTimeout(timer); timer = setTimeout(load, 600); });
      onMapReady(map);
      load();
    })();
    return () => { clearTimeout(timer); mapRef.current?.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-filter when query changes; refetch when strict changes.
  useEffect(() => { if (mapRef.current) render(); /* eslint-disable-next-line */ }, [query]);
  useEffect(() => { if (mapRef.current) { lastKey.current = ''; load(); } /* eslint-disable-next-line */ }, [strict]);

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />;
}
