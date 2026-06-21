'use client';
import { useState } from 'react';

export default function LoginPage() {
  const [msg, setMsg] = useState('');

  const submit = (path: string) => async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
    });
    const d = await r.json();
    if (r.ok) {
      if (d.token) localStorage.setItem('token', d.token);
      location.href = '/';
    } else {
      setMsg(d.error || 'Error');
    }
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '0.7rem 0.9rem', marginBottom: '0.8rem', borderRadius: 10, border: '1px solid rgba(52,211,153,0.22)', background: 'rgba(255,255,255,0.04)', color: '#eafff3' };

  return (
    <div style={{ maxWidth: 380, margin: '8vh auto', padding: '2rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(52,211,153,0.18)', borderRadius: 18 }}>
      <div style={{ fontWeight: 800, fontSize: '1.5rem', textAlign: 'center', marginBottom: '0.5rem' }}>
        🌱 Vegan<span style={{ color: '#34d399' }}>Maps</span>
      </div>
      <p style={{ textAlign: 'center', color: 'rgba(234,255,243,0.55)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Sign in to save your favorite vegan spots.</p>

      <form onSubmit={submit('/api/auth/login')}>
        <input name="email" type="email" placeholder="Email" style={inputStyle} required />
        <input name="password" type="password" placeholder="Password" style={{ ...inputStyle, marginBottom: '1rem' }} required />
        <button type="submit" style={{ width: '100%', padding: '0.75rem', border: 'none', borderRadius: 10, background: '#34d399', color: '#07140b', fontWeight: 700, cursor: 'pointer' }}>Sign in</button>
      </form>

      <p style={{ textAlign: 'center', color: 'rgba(234,255,243,0.45)', margin: '1.2rem 0 0.6rem', fontSize: '0.82rem' }}>New here? Create an account below.</p>
      <form onSubmit={submit('/api/auth/register')}>
        <input name="email" type="email" placeholder="Email" style={inputStyle} required />
        <input name="password" type="password" placeholder="Choose a password" style={{ ...inputStyle, marginBottom: '1rem' }} required />
        <button type="submit" style={{ width: '100%', padding: '0.75rem', borderRadius: 10, background: 'rgba(163,230,53,0.15)', color: '#a3e635', fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(163,230,53,0.4)' }}>Create account</button>
      </form>

      {msg && <p style={{ textAlign: 'center', color: '#fb7185', marginTop: '1rem', fontSize: '0.85rem' }}>{msg}</p>}
      <a href="/" style={{ display: 'block', textAlign: 'center', marginTop: '1.2rem', color: '#9fe9c6', textDecoration: 'none', fontSize: '0.85rem' }}>← Back to map</a>
    </div>
  );
}
