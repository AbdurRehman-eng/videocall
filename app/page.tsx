\"use client\";

import { useState } from \"react\";
import { useTwoPersonCall } from \"./hooks/useTwoPersonCall\";

export default function Home() {
  const {
    localVideoRef,
    remoteVideoRef,
    role,
    phase,
    error,
    isBusy,
    offerPayload,
    answerPayload,
    startAsHost,
    startAsGuest,
    createOffer,
    applyRemoteOfferAndCreateAnswer,
    applyRemoteAnswer,
    hangUp,
  } = useTwoPersonCall();

  const [remoteOfferInput, setRemoteOfferInput] = useState(\"\");
  const [remoteAnswerInput, setRemoteAnswerInput] = useState(\"\");

  const isInCall = phase === \"connected\";

  return (
    <div className=\"min-h-screen bg-black text-zinc-50 font-sans flex flex-col\">
      <main className=\"flex-1 flex flex-col lg:flex-row max-w-6xl mx-auto w-full px-6 lg:px-12 py-10 gap-10\">
        <section className=\"flex-1 flex flex-col justify-between\">
          <div>
            <p className=\"text-sm tracking-[0.3em] text-orange-500 uppercase mb-4\">
              Minimal WebRTC Demo
            </p>
            <h1 className=\"text-5xl sm:text-6xl lg:text-7xl font-semibold leading-tight text-orange-500\">
              Two-Person
              <br />
              Video Call
            </h1>
            <div className=\"h-px bg-zinc-800 mt-10 mb-10\" />
            <div className=\"space-y-10 text-zinc-200 text-sm sm:text-base max-w-md\">
              <div>
                <h2 className=\"font-semibold tracking-wide text-xs text-zinc-400 mb-1\">
                  MINIMAL INTERFACE DESIGN
                </h2>
                <p className=\"text-zinc-300\">
                  Seamless joining for participants with just a connection code.
                </p>
              </div>
              <div>
                <h2 className=\"font-semibold tracking-wide text-xs text-zinc-400 mb-1\">
                  RELIABLE COMMUNICATION
                </h2>
                <p className=\"text-zinc-300\">
                  High-quality audio and video using native WebRTC APIs.
                </p>
              </div>
              <div>
                <h2 className=\"font-semibold tracking-wide text-xs text-zinc-400 mb-1\">
                  WEBRTC IMPLEMENTATION
                </h2>
                <p className=\"text-zinc-300\">
                  Built for future expansion with live captions and translation.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className=\"flex-1 flex flex-col bg-zinc-950/60 border border-zinc-800 rounded-3xl p-5 sm:p-6 lg:p-7 shadow-[0_0_0_1px_rgba(24,24,27,0.8)]\">
          <header className=\"flex items-center justify-between mb-4\">
            <div>
              <h2 className=\"text-sm font-semibold tracking-wide text-zinc-200\">
                Live Room
              </h2>
              <p className=\"text-xs text-zinc-500\">
                Choose your role to start a two-person call.
              </p>
            </div>
            {role && (
              <span className=\"text-[11px] px-3 py-1 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-300 uppercase tracking-wide\">
                {role === \"host\" ? \"Host\" : \"Guest\"} • {phase}
              </span>
            )}
          </header>

          <div className=\"flex-1 flex flex-col gap-4 mb-4\">
            <div className=\"grid grid-cols-1 sm:grid-cols-2 gap-3\">
              <div className=\"relative rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 aspect-video\">
                <video
                  ref={localVideoRef}
                  className=\"w-full h-full object-cover bg-zinc-900\"
                  autoPlay
                  playsInline
                  muted
                />
                <div className=\"absolute bottom-2 left-2 text-[11px] px-2 py-1 rounded-full bg-black/60 text-zinc-200 border border-zinc-700\">
                  You
                </div>
              </div>
              <div className=\"relative rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 aspect-video\">
                <video
                  ref={remoteVideoRef}
                  className=\"w-full h-full object-cover bg-zinc-900\"
                  autoPlay
                  playsInline
                />
                <div className=\"absolute bottom-2 left-2 text-[11px] px-2 py-1 rounded-full bg-black/60 text-zinc-200 border border-zinc-700\">
                  Guest
                </div>
                {!isInCall && (
                  <div className=\"absolute inset-0 flex items-center justify-center text-xs text-zinc-500\">
                    Waiting for connection…
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className=\"space-y-4\">
            {!role && (
              <div className=\"grid grid-cols-2 gap-3\">
                <button
                  type=\"button\"
                  onClick={startAsHost}
                  className=\"h-10 rounded-full bg-orange-500 text-black text-sm font-semibold hover:bg-orange-400 transition disabled:opacity-60 disabled:cursor-not-allowed\"
                  disabled={isBusy}
                >
                  Start as Host
                </button>
                <button
                  type=\"button\"
                  onClick={startAsGuest}
                  className=\"h-10 rounded-full border border-zinc-700 text-sm font-semibold text-zinc-100 hover:bg-zinc-900 transition disabled:opacity-60 disabled:cursor-not-allowed\"
                  disabled={isBusy}
                >
                  Join as Guest
                </button>
              </div>
            )}

            {role === \"host\" && (
              <div className=\"space-y-3\">
                <div className=\"flex items-center justify-between\">
                  <p className=\"text-xs text-zinc-400\">
                    1. Start camera, then generate a connection code and share it
                    with your guest.
                  </p>
                  <button
                    type=\"button\"
                    onClick={createOffer}
                    className=\"text-[11px] px-3 py-1 rounded-full bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed\"
                    disabled={isBusy}
                  >
                    Generate Code
                  </button>
                </div>
                <textarea
                  className=\"w-full h-20 rounded-xl bg-zinc-950 border border-zinc-800 text-xs p-3 resize-none outline-none focus:ring-1 focus:ring-orange-500/70\"
                  value={offerPayload}
                  readOnly
                  placeholder=\"Your connection code will appear here. Copy and send it to the person joining.\"
                />
                <div className=\"space-y-2\">
                  <p className=\"text-xs text-zinc-400\">
                    2. Paste the response code from your guest to connect.
                  </p>
                  <textarea
                    className=\"w-full h-20 rounded-xl bg-zinc-950 border border-zinc-800 text-xs p-3 resize-none outline-none focus:ring-1 focus:ring-orange-500/70\"
                    value={remoteAnswerInput}
                    onChange={(e) => setRemoteAnswerInput(e.target.value)}
                    placeholder=\"Paste the response code you receive from your guest here, then connect.\"
                  />
                  <button
                    type=\"button\"
                    onClick={() => applyRemoteAnswer(remoteAnswerInput)}
                    className=\"w-full h-9 rounded-full bg-zinc-900 border border-zinc-700 text-xs font-semibold hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed\"
                    disabled={!remoteAnswerInput || isBusy}
                  >
                    Connect with Guest
                  </button>
                </div>
              </div>
            )}

            {role === \"guest\" && (
              <div className=\"space-y-3\">
                <div className=\"space-y-2\">
                  <p className=\"text-xs text-zinc-400\">
                    1. Paste the connection code from your host to join.
                  </p>
                  <textarea
                    className=\"w-full h-20 rounded-xl bg-zinc-950 border border-zinc-800 text-xs p-3 resize-none outline-none focus:ring-1 focus:ring-orange-500/70\"
                    value={remoteOfferInput}
                    onChange={(e) => setRemoteOfferInput(e.target.value)}
                    placeholder=\"Paste the connection code you received from the host here.\"
                  />
                  <button
                    type=\"button\"
                    onClick={() =>
                      applyRemoteOfferAndCreateAnswer(remoteOfferInput)
                    }
                    className=\"w-full h-9 rounded-full bg-orange-500 text-black text-xs font-semibold hover:bg-orange-400 disabled:opacity-60 disabled:cursor-not-allowed\"
                    disabled={!remoteOfferInput || isBusy}
                  >
                    Generate Response Code
                  </button>
                </div>
                <div className=\"space-y-2\">
                  <p className=\"text-xs text-zinc-400\">
                    2. Send this response code back to your host.
                  </p>
                  <textarea
                    className=\"w-full h-20 rounded-xl bg-zinc-950 border border-zinc-800 text-xs p-3 resize-none outline-none focus:ring-1 focus:ring-orange-500/70\"
                    value={answerPayload}
                    readOnly
                    placeholder=\"Your response code will appear here. Copy and send it back to the host.\"
                  />
                </div>
              </div>
            )}

            <div className=\"flex items-center justify-between pt-2 border-t border-zinc-900 mt-2\">
              <div className=\"flex items-center gap-2 text-[11px] text-zinc-500\">
                <span className=\"inline-block w-1.5 h-1.5 rounded-full bg-orange-500\" />
                <span>
                  {isInCall
                    ? \"Connected • You can now speak normally.\"
                    : \"This demo uses local-only signaling (copy & paste).\"}
                </span>
              </div>
              <button
                type=\"button\"
                onClick={hangUp}
                className=\"text-[11px] px-3 py-1 rounded-full border border-red-500/70 text-red-400 hover:bg-red-500/10\"
              >
                End Session
              </button>
            </div>

            {error && (
              <div className=\"mt-2 text-xs text-red-400 bg-red-500/10 border border-red-900/60 rounded-lg px-3 py-2\">
                {error}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

