import Link from "next/link";

export default function ReviewGuide() {
  return (
    <section className="page-shell">
      <div className="panel panel-strong section-stack">
        <span className="eyebrow">Review</span>
        <h1 className="title-lg">Reviewer guide for SignRepair.</h1>
        <p className="body-sm">
          This page helps a reviewer inspect scope, privacy promises, demo path, and remaining
          manual checks without digging through every screen first.
        </p>
      </div>

      <div className="memory-grid">
        <div className="section-stack">
          <section className="panel section-stack">
            <h2 className="title-md">What this prototype is</h2>
            <ul className="list">
              <li>Privacy-first sign evidence and repair prototype.</li>
              <li>Known-candidate demo with honest uncertainty.</li>
              <li>Local landmark-derived memory, receipts, and review tools.</li>
            </ul>
          </section>

          <section className="panel section-stack">
            <h2 className="title-md">What it is not</h2>
            <ul className="list">
              <li>Not certified interpretation.</li>
              <li>Not for medical, legal, emergency, or official use.</li>
              <li>Not linguistic authority or official ASL analysis.</li>
              <li>Not full sign-language coverage.</li>
            </ul>
          </section>

          <section className="panel section-stack">
            <h2 className="title-md">Quick routes</h2>
            <p className="body-sm">
              Use these pages in order if you want short product walk-through.
            </p>
            <div className="memory-actions">
              <Link href="/" className="button">
                Home
              </Link>
              <Link href="/live" className="button-soft">
                Live
              </Link>
              <Link href="/verify" className="button-soft">
                Verify
              </Link>
              <Link href="/teach" className="button-soft">
                Teach
              </Link>
              <Link href="/minimal-pair" className="button-soft">
                Minimal Pair Lab
              </Link>
              <Link href="/evidence-health" className="button-soft">
                Evidence Health
              </Link>
              <Link href="/memory" className="button-ghost">
                Memory
              </Link>
            </div>
          </section>

          <section className="panel section-stack">
            <h2 className="title-md">Demo path links</h2>
            <p className="body-sm">
              Start at Home for consent and limits, then Live for uncertainty, then Memory for
              export and clear-all.
            </p>
            <div className="receipt-summary-list">
              <p className="caption">Home: consent, limits, and safety box.</p>
              <p className="caption">Live: candidate state, Translation Debt, cue patches, receipts.</p>
              <p className="caption">Verify: upload clip, inspect exact model output, compare to expected reference.</p>
              <p className="caption">Evidence Health: local memory quality and drift review.</p>
              <p className="caption">Memory: export, delete, and clear all local data.</p>
            </div>
          </section>
        </div>

        <aside className="section-stack">
          <section className="panel section-stack">
            <h2 className="title-md">Privacy promises</h2>
            <ul className="list">
              <li>Landmark-derived storage only.</li>
              <li>No raw video, no pixels, no base64 image payloads.</li>
              <li>Local IndexedDB storage only. No upload path.</li>
              <li>Export and clear-all stay user-controlled.</li>
            </ul>
          </section>

          <section className="panel section-stack">
            <h2 className="title-md">Manual checks still needed</h2>
            <ul className="list">
              <li>Real Chrome webcam flow with real MediaPipe assets.</li>
              <li>Safari or WebKit camera and wasm behavior.</li>
              <li>Real route-change camera cleanup on hardware stream.</li>
              <li>DevTools IndexedDB inspection for landmark-only persistence.</li>
            </ul>
          </section>

          <section className="panel section-stack">
            <h2 className="title-md">Export and clear-all guidance</h2>
            <p className="body-sm">
              Use Memory to export local JSON, inspect for landmark-only fields, then clear all
              local data and verify empty states return.
            </p>
            <div className="memory-actions">
              <Link href="/memory" className="button">
                Open Memory
              </Link>
              <Link href="/evidence-health" className="button-soft">
                Open Evidence Health
              </Link>
            </div>
          </section>

          <section className="panel info-box">
            <strong>Reviewer note</strong>
            <p className="body-sm">
              Reviewer should trust inspectability and clear limitations, not polished certainty.
            </p>
          </section>
        </aside>
      </div>
    </section>
  );
}
