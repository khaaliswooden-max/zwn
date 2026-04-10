'use client';

import { useState } from 'react';

const TRACKS = [
  {
    name: 'API Access',
    audience: 'Developers & Builders',
    description:
      'Query the ZWM graph directly. World state, causal chains, composite risk — all via REST and GraphQL.',
    features: [
      'Enterprise REST API',
      'GraphQL subscriptions',
      'TypeScript SDK',
      'Up to 10,000 queries/day',
    ],
    cta: 'Get API Key',
  },
  {
    name: 'Platform Partnership',
    audience: 'Technology Partners',
    description:
      'Integrate your platform as a substrate. Emit events, ingest causal effects, join the world model.',
    features: [
      'Custom substrate adapter',
      'Anchor event integration',
      'Causal rule co-design',
      'Neo4j graph access',
    ],
    cta: 'Start Integration',
  },
  {
    name: 'Institutional Access',
    audience: 'Enterprises & Government',
    description:
      'Full world model access with dedicated infrastructure, SLAs, and compliance attestation support.',
    features: [
      'Dedicated Neo4j instance',
      'Custom causal rules',
      'Treaty attestation layer',
      'Governance integration',
    ],
    cta: 'Contact Us',
  },
];

export default function BuildPage() {
  const [selectedTrack, setSelectedTrack] = useState('API Access');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [org, setOrg] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const resp = await fetch('/api/access-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, org, message, track: selectedTrack }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }
      setSubmitted(true);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="text-center mb-12">
        <div className="text-[9px] text-zwn-muted tracking-[0.3em] mb-2">
          BUILD ON ZWM
        </div>
        <h1 className="text-2xl text-zwn-text font-semibold tracking-wide">
          Access the World Model
        </h1>
        <p className="text-[13px] text-zwn-muted mt-3 max-w-lg mx-auto">
          Three tracks. Choose the level of integration that matches your needs.
        </p>
      </div>

      {/* Track cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-16">
        {TRACKS.map((track) => (
          <div
            key={track.name}
            className={`border rounded p-5 space-y-4 transition-colors cursor-pointer ${
              selectedTrack === track.name
                ? 'border-zwn-teal bg-zwn-teal/5'
                : 'border-zwn-border bg-zwn-surface hover:border-opacity-60'
            }`}
            onClick={() => setSelectedTrack(track.name)}
          >
            <div className="text-[9px] text-zwn-teal tracking-widest font-semibold">
              {track.name.toUpperCase()}
            </div>
            <div className="text-[11px] text-zwn-muted">{track.audience}</div>
            <div className="text-[11px] text-zwn-text/80 leading-relaxed">
              {track.description}
            </div>
            <ul className="space-y-1">
              {track.features.map((f) => (
                <li
                  key={f}
                  className="text-[10px] text-zwn-muted flex items-center gap-2"
                >
                  <span className="w-1 h-1 rounded-full bg-zwn-teal flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedTrack(track.name);
                document.getElementById('contact-form')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="w-full text-[10px] tracking-widest text-zwn-teal border border-zwn-teal/30 rounded px-3 py-2 hover:bg-zwn-teal/10 transition-colors"
            >
              {track.cta.toUpperCase()}
            </button>
          </div>
        ))}
      </div>

      {/* Contact form */}
      <div id="contact-form" className="max-w-md mx-auto">
        <div className="text-[9px] text-zwn-muted tracking-widest text-center mb-4">
          REQUEST ACCESS
        </div>
        {submitted ? (
          <div className="text-center text-[11px] text-zwn-teal py-8">
            Request received. We&apos;ll be in touch.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex gap-2">
              {TRACKS.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => setSelectedTrack(t.name)}
                  className={`flex-1 text-[9px] tracking-widest py-2 rounded border transition-colors ${
                    selectedTrack === t.name
                      ? 'border-zwn-teal text-zwn-teal bg-zwn-teal/5'
                      : 'border-zwn-border text-zwn-muted hover:text-zwn-text'
                  }`}
                >
                  {t.name.toUpperCase()}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zwn-surface border border-zwn-border rounded px-4 py-2.5 text-[12px] text-zwn-text placeholder-zwn-border outline-none focus:border-zwn-teal transition-colors"
            />
            <input
              type="email"
              placeholder="Email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-zwn-surface border border-zwn-border rounded px-4 py-2.5 text-[12px] text-zwn-text placeholder-zwn-border outline-none focus:border-zwn-teal transition-colors"
            />
            <input
              type="text"
              placeholder="Organization"
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              className="w-full bg-zwn-surface border border-zwn-border rounded px-4 py-2.5 text-[12px] text-zwn-text placeholder-zwn-border outline-none focus:border-zwn-teal transition-colors"
            />
            <textarea
              placeholder="What are you building?"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full bg-zwn-surface border border-zwn-border rounded px-4 py-2.5 text-[12px] text-zwn-text placeholder-zwn-border outline-none focus:border-zwn-teal transition-colors resize-none"
            />
            {error && (
              <div className="text-[11px] text-red-400">{error}</div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full text-[11px] tracking-widest text-zwn-bg bg-zwn-teal rounded px-4 py-2.5 font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? 'SUBMITTING...' : 'SUBMIT REQUEST'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
