"use client";

import { startTransition, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LocalDataStore, localDataStore } from "@/lib/privacy/LocalDataStore";

interface ConsentScreenProps {
  dataStore?: LocalDataStore;
  liveHref?: string;
}

export default function ConsentScreen({
  dataStore = localDataStore,
  liveHref = "/live",
}: ConsentScreenProps) {
  const router = useRouter();
  const [acknowledged, setAcknowledged] = useState(false);
  const [alreadyAccepted, setAlreadyAccepted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void (async () => {
      const consentAccepted = await dataStore.getSetting("consentAccepted", false);

      if (!active) {
        return;
      }

      setAlreadyAccepted(consentAccepted);
      setAcknowledged(consentAccepted);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [dataStore]);

  const handleStart = async () => {
    await dataStore.setSetting("consentAccepted", true);

    startTransition(() => {
      router.push(liveHref);
    });
  };

  return (
    <section className="page-shell">
      <div className="hero-grid">
        <div className="panel panel-strong hero-panel">
          <span className="eyebrow">Home</span>
          <h1 className="title-xl">SignRepair</h1>
          <p className="body-lg">
            Privacy-first sign evidence and repair prototype.
          </p>
          <p className="body-sm">
            Review consent and limits before opening live known-candidate demo or benchmark
            verification.
          </p>
          <label className="checkbox-row" htmlFor="consent-check">
            <input
              id="consent-check"
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              disabled={loading}
              aria-label="Acknowledge SignRepair prototype limits and local-only video handling"
            />
            <span>
              I understand video stays on device by default, raw video is not saved,
              and demo candidates are illustrative known-candidate examples rather than
              authoritative coverage.
            </span>
          </label>
          <div className="button-row">
            <button
              type="button"
              className="button"
              onClick={() => void handleStart()}
              disabled={!acknowledged || loading}
              aria-label="Start live demo after acknowledging prototype limits"
            >
              Start live demo
            </button>
            <a
              href="#privacy-limits"
              className="button-ghost"
              aria-label="Review privacy and limits on this page"
            >
              Review privacy and limits
            </a>
            <Link
              href="/evidence-health"
              className="button-soft"
              aria-label="Open Evidence Health dashboard"
            >
              Open Evidence Health
            </Link>
            <Link
              href="/verify"
              className="button-soft"
              aria-label="Open Upload and Verify benchmark screen"
            >
              Open Verify
            </Link>
          </div>
          {alreadyAccepted ? (
            <p className="caption">Consent already saved on this device for this browser.</p>
          ) : null}
        </div>

        <aside className="panel hero-panel">
          <span className="badge">Product spine</span>
          <div className="card-grid">
            <div className="prediction-card">
              <h2 className="title-md">Honest uncertainty</h2>
              <p className="body-sm">
                Show known-candidate demo labels only when evidence clears thresholds. Otherwise,
                ask for repair instead of pretending confidence.
              </p>
            </div>
            <div className="prediction-card">
              <h2 className="title-md">Local-only memory</h2>
              <p className="body-sm">
                Save local repair memory, personal signs, and contrast cards with landmark-derived
                data only on this device.
              </p>
            </div>
            <div className="prediction-card">
              <h2 className="title-md">Inspectable evidence</h2>
              <p className="body-sm">
                Review Motion Receipts, coarse sign-form evidence, and memory health without raw
                video storage.
              </p>
            </div>
          </div>
          <div id="privacy-limits" className="warning-box">
            <strong>Safety and limits</strong>
            <p className="body-sm">
              Low-stakes only. This is known-candidate demo, not certified interpretation.
            </p>
            <ul className="list">
              <li>Low-stakes use only.</li>
              <li>Not medical, legal, emergency, or official interpreting.</li>
              <li>Not certified interpretation.</li>
              <li>Demo candidates are illustrative known-candidate examples.</li>
              <li>Deaf-led review required before real deployment.</li>
            </ul>
          </div>
          <div className="info-box">
            <strong>Core loop</strong>
            <ul className="list">
              <li>Watch known candidates.</li>
              <li>Verify uploaded clips against human reference.</li>
              <li>Show uncertainty honestly.</li>
              <li>Explain missing evidence.</li>
              <li>Save local repair memory only if you choose to.</li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
