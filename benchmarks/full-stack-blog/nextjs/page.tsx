// app/page.tsx — Polished version (1:1 match with NyxCode blog-benchmark.nyx)
"use client";

import { useState, useEffect } from "react";

interface Author {
  id: number;
  name: string;
  email: string;
  role: string | null;
}

interface Post {
  id: number;
  title: string;
  body: string;
  author: Author;
  created_at: string;
}

function getToken() {
  if (typeof window !== "undefined") return localStorage.getItem("token");
  return null;
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

// PostCard Component
function PostCard({ title, body, authorName, date }: {
  title: string; body: string; authorName: string; date: string;
}) {
  return (
    <article style={{
      background: "var(--card)", borderRadius: "16px", padding: "2rem",
      marginBottom: "1.25rem", border: "1px solid var(--border)",
      transition: "transform 0.2s, box-shadow 0.2s",
    }}>
      <h3 style={{ color: "var(--text)", fontSize: "1.35rem", fontWeight: 600, marginBottom: "0.75rem", fontFamily: "'Space Grotesk', sans-serif" }}>
        {title}
      </h3>
      <p style={{ color: "var(--muted)", lineHeight: 1.7, marginBottom: "1.25rem", fontSize: "0.95rem" }}>
        {body}
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%", background: "var(--primary)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 600, fontSize: "0.8rem", color: "#000",
          }}>
            {authorName?.[0]?.toUpperCase()}
          </div>
          <span style={{ color: "var(--accent)", fontWeight: 500, fontSize: "0.9rem" }}>{authorName}</span>
        </div>
        <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{date}</span>
      </div>
    </article>
  );
}

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => { fetchPosts(); }, []);

  async function fetchPosts() {
    const res = await fetch("/api/posts");
    if (res.ok) setPosts(await res.json());
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: regName, email: regEmail, password: regPassword }),
    });
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem("token", data.token);
      showToast("Account created! Now login.");
    } else {
      showToast("Registration failed");
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: loginEmail, password: loginPassword }),
    });
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem("token", data.token);
      showToast("Welcome back!");
    } else {
      showToast("Invalid credentials");
    }
  }

  async function handlePublish(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title, body }),
    });
    if (res.ok) {
      setTitle("");
      setBody("");
      fetchPosts();
    } else {
      showToast("Please sign in first");
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  return (
    <>
      <style>{`
        :root {
          --primary: #f59e0b;
          --bg: #0a0a12;
          --card: #12121f;
          --surface: #1a1a2e;
          --text: #e8e8e8;
          --muted: #888;
          --accent: #22d3ee;
          --success: #22c55e;
          --danger: #ef4444;
          --border: #2a2a3e;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; line-height: 1.6; }
        a { color: var(--accent); text-decoration: none; }
        a:hover { text-decoration: underline; }
        ::selection { background: var(--primary); color: #000; }
      `}</style>

      {toast && (
        <div style={{ position: "fixed", top: "1rem", right: "1rem", background: "var(--primary)", color: "#000", padding: "0.75rem 1.5rem", borderRadius: "10px", fontWeight: 600, zIndex: 1000, fontSize: "0.9rem" }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <header style={{ borderBottom: "1px solid var(--border)", marginBottom: "3rem" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "1.5rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ fontSize: "1.5rem" }}>🐺</span>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>NyxBlog</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Built with</span>
            <a href="https://nyxcode.io" style={{ color: "var(--primary)", fontWeight: 600, fontSize: "0.85rem" }}>NyxCode</a>
            <span style={{ color: "var(--muted)", fontSize: "0.75rem", background: "var(--surface)", padding: "0.15rem 0.5rem", borderRadius: 6 }}>v0.11.5</span>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 1.5rem" }}>
        {/* Hero */}
        <section style={{ textAlign: "center", marginBottom: "3.5rem", paddingTop: "1rem" }}>
          <span style={{ color: "var(--primary)", fontSize: "0.85rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>
            ✨ Full-Stack in One File
          </span>
          <h2 style={{ fontSize: "2.75rem", fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif", marginTop: "0.75rem", marginBottom: "0.75rem", lineHeight: 1.15 }}>
            The NyxCode Blog Demo
          </h2>
          <p style={{ color: "var(--muted)", fontSize: "1.15rem", maxWidth: 500, margin: "0 auto" }}>
            Auth, relations, cascade deletes — 127 lines of NyxCode.
          </p>
        </section>

        {/* Stats */}
        <div style={{ display: "flex", justifyContent: "center", gap: "2.5rem", marginBottom: "3.5rem", padding: "1.25rem 2rem", background: "var(--card)", borderRadius: 14, border: "1px solid var(--border)" }}>
          {[
            { value: "127", label: "Lines", color: "var(--primary)" },
            { value: "1,392", label: "Tokens", color: "var(--accent)" },
            { value: "1", label: "File", color: "var(--success)" },
            { value: "66%", label: "Fewer Tokens", color: "var(--danger)" },
          ].map((stat) => (
            <div key={stat.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.75rem", fontWeight: 800, color: stat.color, fontFamily: "'Space Grotesk', sans-serif" }}>{stat.value}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginTop: "0.15rem" }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Auth */}
        <details style={{ background: "var(--card)", borderRadius: 16, padding: "1.75rem", marginBottom: "2rem", border: "1px solid var(--border)" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "1rem", fontFamily: "'Space Grotesk', sans-serif" }}>
            🔐 Account
          </summary>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", marginTop: "1.5rem" }}>
            <div>
              <h3 style={{ color: "var(--success)", marginBottom: "1rem", fontSize: "0.95rem", fontWeight: 600 }}>Register</h3>
              <form onSubmit={handleRegister}>
                <input value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="Name" required style={inputStyle} />
                <input value={regEmail} onChange={(e) => setRegEmail(e.target.value)} type="email" placeholder="Email" required style={inputStyle} />
                <input value={regPassword} onChange={(e) => setRegPassword(e.target.value)} type="password" placeholder="Password" required style={inputStyle} />
                <button type="submit" style={btnSuccess}>Create Account</button>
              </form>
            </div>
            <div>
              <h3 style={{ color: "var(--primary)", marginBottom: "1rem", fontSize: "0.95rem", fontWeight: 600 }}>Login</h3>
              <form onSubmit={handleLogin}>
                <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} type="email" placeholder="Email" required style={inputStyle} />
                <input value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} type="password" placeholder="Password" required style={inputStyle} />
                <button type="submit" style={btnPrimary}>Sign In</button>
              </form>
            </div>
          </div>
        </details>

        {/* Compose */}
        <div style={{ background: "var(--card)", borderRadius: 16, padding: "1.75rem", marginBottom: "2.5rem", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
            <span style={{ fontSize: "1.25rem" }}>✍️</span>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>Write a Post</h2>
          </div>
          <form onSubmit={handlePublish}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Post title" required style={{ ...inputStyle, fontSize: "1.05rem", fontWeight: 500 }} />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="What's on your mind?" required style={{ ...inputStyle, minHeight: 140, resize: "vertical" as const }} />
            <button type="submit" style={btnPrimary}>Publish →</button>
          </form>
        </div>

        {/* Feed */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
          <span style={{ fontSize: "1.25rem" }}>📰</span>
          <h2 style={{ fontSize: "1.15rem", fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>Latest Posts</h2>
        </div>

        {posts.map((post) => (
          <PostCard
            key={post.id}
            title={post.title}
            body={post.body}
            authorName={post.author?.name || "Anonymous"}
            date={post.created_at}
          />
        ))}

        {posts.length === 0 && (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--muted)" }}>
            <p style={{ fontSize: "1rem" }}>No posts yet. Be the first to write one! ✨</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid var(--border)", marginTop: "4rem", padding: "2rem 0", textAlign: "center" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 1.5rem" }}>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
            Built with NyxCode v0.11.5 — 127 lines, 1 file, 66% fewer tokens than Next.js
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "1.5rem", marginTop: "0.75rem" }}>
            <a href="https://github.com/fabudde/nyxcode" style={{ color: "var(--accent)", fontSize: "0.85rem" }}>GitHub</a>
            <a href="https://www.npmjs.com/package/@fabudde/nyxcode" style={{ color: "var(--accent)", fontSize: "0.85rem" }}>npm</a>
            <a href="https://rudel.fun" style={{ color: "var(--accent)", fontSize: "0.85rem" }}>rudel.fun</a>
          </div>
        </div>
      </footer>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.75rem 1rem",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  fontSize: "0.95rem",
  marginBottom: "0.75rem",
  outline: "none",
};

const btnPrimary: React.CSSProperties = {
  background: "var(--primary)",
  color: "#000",
  padding: "0.75rem 1.5rem",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.95rem",
};

const btnSuccess: React.CSSProperties = {
  background: "var(--success)",
  color: "#fff",
  padding: "0.75rem 1.5rem",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.95rem",
};
