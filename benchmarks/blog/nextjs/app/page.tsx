"use client";

import { useEffect, useState, FormEvent } from "react";

type Post = { id: number; title: string; body: string; created: string };

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchPosts() {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/posts", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError("Failed to load posts");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setPosts(data.posts);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPosts();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const token = localStorage.getItem("token");
    if (!token) {
      setError("Please log in first");
      return;
    }
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title, body }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to publish");
      return;
    }
    setTitle("");
    setBody("");
    window.location.reload();
  }

  if (loading) return <main className="p-8">Loading...</main>;

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6" style={{ color: "#667eea" }}>
        My Blog
      </h1>

      <form onSubmit={handleSubmit} className="mb-8 space-y-3">
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full p-3 rounded bg-card border border-gray-700"
          style={{ background: "#1a1a2e" }}
        />
        <textarea
          placeholder="Write..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={5}
          className="w-full p-3 rounded bg-card border border-gray-700"
          style={{ background: "#1a1a2e" }}
        />
        <button
          type="submit"
          className="px-4 py-2 rounded"
          style={{ background: "#667eea", color: "white" }}
        >
          Publish
        </button>
        {error && <p className="text-red-400">{error}</p>}
      </form>

      <div className="space-y-4">
        {posts.map((post) => (
          <section
            key={post.id}
            className="rounded-xl p-6"
            style={{ background: "#1a1a2e" }}
          >
            <h3 className="text-xl font-semibold mb-2">{post.title}</h3>
            <p className="text-gray-300">{post.body}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
