"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { translateText, type LanguageCode } from "../utils/translation";

type CallPhase =
  | "idle"
  | "media-ready"
  | "waiting-offer"
  | "waiting-answer"
  | "connected"
  | "ended";

export type Role = "host" | "guest" | null;

export interface UseTwoPersonCallResult {
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  role: Role;
  phase: CallPhase;
  error: string | null;
  isBusy: boolean;
  offerPayload: string;
  answerPayload: string;
  captionsSupported: boolean;
  captionsLanguage: string;
  localCaption: string;
  remoteCaption: string;
  remoteCaptionTranslated: string;
  translationLanguage: string;
  isTranslating: boolean;
  setCaptionsLanguage: (languageCode: string) => void;
  setTranslationLanguage: (languageCode: string) => void;
  startAsHost: () => Promise<void>;
  startAsGuest: () => Promise<void>;
  createOffer: () => Promise<void>;
  applyRemoteOfferAndCreateAnswer: (remoteOffer: string) => Promise<void>;
  applyRemoteAnswer: (remoteAnswer: string) => Promise<void>;
  hangUp: () => void;
}

const iceServers: RTCIceServer[] = [
  {
    urls: "stun:stun.l.google.com:19302",
  },
];

type CaptionPayload = {
  kind: "caption";
  text: string;
  language: string;
  timestamp: number;
};

export function useTwoPersonCall(): UseTwoPersonCallResult {
  const [role, setRole] = useState<Role>(null);
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [offerPayload, setOfferPayload] = useState("");
  const [answerPayload, setAnswerPayload] = useState("");
  const [captionsSupported, setCaptionsSupported] = useState(false);
  const [captionsLanguage, setCaptionsLanguage] = useState("en-US");
  const [localCaption, setLocalCaption] = useState("");
  const [remoteCaption, setRemoteCaption] = useState("");
  const [remoteCaptionTranslated, setRemoteCaptionTranslated] = useState("");
  const [translationLanguage, setTranslationLanguage] = useState<LanguageCode>("en");
  const [isTranslating, setIsTranslating] = useState(false);
  
  const remoteCaptionLanguageRef = useRef<string>("en-US");
  const translationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const roleRef = useRef<Role>(null);

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    setLocalCaption("");
  }, []);

  const resetState = useCallback(() => {
    setPhase("idle");
    setRole(null);
    roleRef.current = null;
    setError(null);
    setIsBusy(false);
    setOfferPayload("");
    setAnswerPayload("");
    setLocalCaption("");
    setRemoteCaption("");
    setRemoteCaptionTranslated("");
    remoteCaptionLanguageRef.current = "en-US";
    if (translationTimeoutRef.current) {
      clearTimeout(translationTimeoutRef.current);
      translationTimeoutRef.current = null;
    }
  }, []);

  const cleanupPeerConnection = useCallback(() => {
    pcRef.current?.getSenders().forEach((sender) => {
      try {
        sender.track?.stop();
      } catch {
        // ignore
      }
    });
    pcRef.current?.close();
    pcRef.current = null;

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    dataChannelRef.current = null;
    stopRecognition();
  }, [stopRecognition]);

  const ensurePeerConnection = useCallback(() => {
    if (pcRef.current) return pcRef.current;

    const pc = new RTCPeerConnection({ iceServers });

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (remoteVideoRef.current && stream) {
        remoteVideoRef.current.srcObject = stream;
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === "connected" || state === "completed") {
        setPhase("connected");
      } else if (state === "disconnected" || state === "failed" || state === "closed") {
        setPhase("ended");
      }
    };

    pc.onicecandidateerror = () => {
      setError(
        "Network error while negotiating connection. Please check your network and try again.",
      );
    };

    pcRef.current = pc;

    // Data channel for captions: host will create it in createOffer(),
    // guest will receive it via the ondatachannel handler below.

    pc.ondatachannel = (event) => {
      if (event.channel.label !== "captions") return;
      const channel = event.channel;
      
      // Only set if we don't already have a data channel (guest receives it)
      if (!dataChannelRef.current) {
        dataChannelRef.current = channel;
      }

      channel.onopen = () => {
        console.log("Data channel opened (guest)");
      };

      channel.onmessage = (ev) => {
        try {
          const payload = JSON.parse(String(ev.data)) as CaptionPayload;
          if (payload.kind === "caption") {
            setRemoteCaption(payload.text);
            remoteCaptionLanguageRef.current = payload.language;
            // Trigger translation if enabled
            if (translationLanguage && translationLanguage !== "en") {
              translateRemoteCaption(payload.text, payload.language);
            } else {
              setRemoteCaptionTranslated("");
            }
          }
        } catch {
          // ignore malformed messages
        }
      };
      
      channel.onerror = (err) => {
        console.error("Data channel error:", err);
      };
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current as MediaStream);
      });
    }

    return pc;
  }, []);

  const startLocalMedia = useCallback(async () => {
    if (localStreamRef.current) {
      setPhase("media-ready");
      return;
    }

    try {
      setIsBusy(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setPhase("media-ready");
    } catch (err) {
      console.error(err);
      setError(
        "Unable to access camera or microphone. Please grant permissions and try again.",
      );
    } finally {
      setIsBusy(false);
    }
  }, []);

  const startAsHost = useCallback(async () => {
    setRole("host");
    roleRef.current = "host";
    await startLocalMedia();
    setPhase("waiting-offer");
  }, [startLocalMedia]);

  const startAsGuest = useCallback(async () => {
    setRole("guest");
    roleRef.current = "guest";
    await startLocalMedia();
    setPhase("waiting-offer");
  }, [startLocalMedia]);

  const waitForIceGatheringComplete = (pc: RTCPeerConnection) =>
    new Promise<void>((resolve) => {
      if (pc.iceGatheringState === "complete") {
        resolve();
        return;
      }
      const checkState = () => {
        if (pc.iceGatheringState === "complete") {
          pc.removeEventListener("icegatheringstatechange", checkState);
          resolve();
        }
      };
      pc.addEventListener("icegatheringstatechange", checkState);
    });

  const createOffer = useCallback(async () => {
    if (role !== "host") {
      setError("Only the host can create an offer.");
      return;
    }

    // Prevent creating multiple offers
    if (offerPayload) {
      setError("Connection code already generated. Please use the existing code or refresh the page.");
      return;
    }

    try {
      setIsBusy(true);
      const pc = ensurePeerConnection();

      // Check if we already have a local description
      if (pc.localDescription) {
        setError("Offer already created. Please use the existing connection code.");
        return;
      }

      // Create data channel for captions if it doesn't exist
      if (!dataChannelRef.current && role === "host") {
        const channel = pc.createDataChannel("captions");
        dataChannelRef.current = channel;
        
        channel.onopen = () => {
          console.log("Data channel opened (host)");
        };
        
        channel.onmessage = (ev) => {
          try {
            const payload = JSON.parse(String(ev.data)) as CaptionPayload;
            if (payload.kind === "caption") {
              setRemoteCaption(payload.text);
              remoteCaptionLanguageRef.current = payload.language;
              // Trigger translation if enabled
              if (translationLanguage && translationLanguage !== "en") {
                translateRemoteCaption(payload.text, payload.language);
              } else {
                setRemoteCaptionTranslated("");
              }
            }
          } catch {
            // ignore malformed messages
          }
        };
        
        channel.onerror = (err) => {
          console.error("Data channel error:", err);
        };
      }

      const localStream = localStreamRef.current;
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          const alreadyAdded = pc
            .getSenders()
            .some((sender) => sender.track === track);
          if (!alreadyAdded) {
            pc.addTrack(track, localStream);
          }
        });
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(pc);

      const withIce = pc.localDescription;
      if (withIce) {
        setOfferPayload(JSON.stringify(withIce));
      }
    } catch (err) {
      console.error(err);
      setError("Failed to create offer. Please refresh and try again.");
    } finally {
      setIsBusy(false);
    }
  }, [ensurePeerConnection, role, offerPayload]);

  const applyRemoteOfferAndCreateAnswer = useCallback(
    async (remoteOffer: string) => {
      if (role !== "guest") {
        setError("Only the guest can use a host's connection code.");
        return;
      }

      try {
        setIsBusy(true);
        const pc = ensurePeerConnection();

        // Check if we've already set a remote description
        if (pc.remoteDescription) {
          setError("Connection code already applied. Please wait or refresh the page.");
          return;
        }

        let offer: RTCSessionDescriptionInit;
        try {
          // Try to parse the JSON, handling potential whitespace or formatting issues
          let cleaned = remoteOffer.trim();
          
          // Remove any potential BOM or invisible characters
          cleaned = cleaned.replace(/^\uFEFF/, '');
          
          // Try to extract JSON if there's extra text around it
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            cleaned = jsonMatch[0];
          }
          
          offer = JSON.parse(cleaned);
        } catch (parseError) {
          console.error("Failed to parse remote offer JSON:", parseError);
          console.error("Input length:", remoteOffer.length);
          console.error("Input preview:", remoteOffer.substring(0, 200));
          if (remoteOffer.length > 200) {
            console.error("Input end:", remoteOffer.substring(remoteOffer.length - 200));
          }
          setError(`Invalid connection data format. Error: ${parseError instanceof Error ? parseError.message : 'Unknown error'}. Please check that you copied the complete offer without any extra text.`);
          return;
        }
        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await waitForIceGatheringComplete(pc);

        const withIce = pc.localDescription;
        if (withIce) {
          setAnswerPayload(JSON.stringify(withIce));
        }

        setPhase("waiting-answer");
        
        // Check if connection is already established (can happen quickly)
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          setPhase("connected");
        }
      } catch (err) {
        console.error(err);
        if (err instanceof Error && err.message.includes("InvalidStateError")) {
          setError("Connection already in progress. Please refresh and try again.");
        } else {
          setError("The connection code looks invalid. Please check and try again.");
        }
      } finally {
        setIsBusy(false);
      }
    },
    [ensurePeerConnection, role],
  );

  const applyRemoteAnswer = useCallback(
    async (remoteAnswer: string) => {
      if (role !== "host") {
        setError("Only the host can apply a guest's response code.");
        return;
      }

      try {
        setIsBusy(true);
        const pc = ensurePeerConnection();
        
        // Check if we've already set a remote description
        if (pc.remoteDescription) {
          setError("Response code already applied. Connection should be active.");
          // If already connected, just update phase
          if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
            setPhase("connected");
          }
          return;
        }

        // Ensure we have a local description (offer) before setting remote answer
        if (!pc.localDescription) {
          setError("Please generate a connection code first.");
          return;
        }

        let answer: RTCSessionDescriptionInit;
        try {
          // Try to parse the JSON, handling potential whitespace or formatting issues
          let cleaned = remoteAnswer.trim();
          
          // Remove any potential BOM or invisible characters
          cleaned = cleaned.replace(/^\uFEFF/, '');
          
          // Try to extract JSON if there's extra text around it
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            cleaned = jsonMatch[0];
          }
          
          answer = JSON.parse(cleaned);
        } catch (parseError) {
          console.error("Failed to parse remote answer JSON:", parseError);
          console.error("Input length:", remoteAnswer.length);
          console.error("Input preview:", remoteAnswer.substring(0, 200));
          if (remoteAnswer.length > 200) {
            console.error("Input end:", remoteAnswer.substring(remoteAnswer.length - 200));
          }
          setError(`Invalid connection data format. Error: ${parseError instanceof Error ? parseError.message : 'Unknown error'}. Please check that you copied the complete response without any extra text.`);
          return;
        }
        
        // Check the signaling state - we should be in "have-local-offer" state
        if (pc.signalingState !== "have-local-offer") {
          setError(
            `Invalid connection state: ${pc.signalingState}. Please generate a new connection code.`,
          );
          return;
        }

        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        setPhase("connected");
      } catch (err) {
        console.error(err);
        if (err instanceof Error) {
          if (err.message.includes("InvalidStateError") || err.message.includes("wrong state")) {
            setError(
              "Connection state error. Please generate a new connection code and try again.",
            );
          } else {
            setError("The response code looks invalid. Please check and try again.");
          }
        } else {
          setError("The response code looks invalid. Please check and try again.");
        }
      } finally {
        setIsBusy(false);
      }
    },
    [ensurePeerConnection, role],
  );

  // Translate remote caption in real-time
  const translateRemoteCaption = useCallback(
    async (text: string, sourceLanguage: string) => {
      if (!text.trim() || translationLanguage === "en") {
        setRemoteCaptionTranslated("");
        return;
      }

      // Debounce translation to avoid too many API calls
      if (translationTimeoutRef.current) {
        clearTimeout(translationTimeoutRef.current);
      }

      translationTimeoutRef.current = setTimeout(async () => {
        setIsTranslating(true);
        try {
          const translated = await translateText(
            text,
            sourceLanguage,
            translationLanguage,
          );
          setRemoteCaptionTranslated(translated);
        } catch (error) {
          console.error("Translation failed:", error);
          setRemoteCaptionTranslated("");
        } finally {
          setIsTranslating(false);
        }
      }, 300); // 300ms debounce
    },
    [translationLanguage],
  );

  // Update translation when language changes
  useEffect(() => {
    if (remoteCaption && translationLanguage && translationLanguage !== "en") {
      translateRemoteCaption(remoteCaption, remoteCaptionLanguageRef.current);
    } else {
      setRemoteCaptionTranslated("");
    }
  }, [translationLanguage, remoteCaption, translateRemoteCaption]);

  const handleSetTranslationLanguage = useCallback((languageCode: string) => {
    setTranslationLanguage(languageCode as LanguageCode);
  }, []);

  const hangUp = useCallback(() => {
    cleanupPeerConnection();
    resetState();
  }, [cleanupPeerConnection, resetState]);

  useEffect(() => {
    return () => {
      cleanupPeerConnection();
    };
  }, [cleanupPeerConnection]);

   // Detect browser support for speech recognition (Web Speech API).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setCaptionsSupported(false);
      return;
    }
    setCaptionsSupported(true);
  }, []);

  // Start / stop speech recognition when connected and supported.
  useEffect(() => {
    if (!captionsSupported || typeof window === "undefined") {
      stopRecognition();
      return;
    }

    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      stopRecognition();
      return;
    }

    if (phase === "connected") {
      // Stop existing recognition if language changed or if already running
      if (recognitionRef.current) {
        stopRecognition();
      }

      const recognition: SpeechRecognition = new SpeechRecognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = captionsLanguage;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let latest = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          latest = result[0].transcript.trim();
        }
        if (!latest) return;

        setLocalCaption(latest);

        // Send only finalized phrases to the remote side.
        const lastResult = event.results[event.results.length - 1];
        if (lastResult && lastResult.isFinal) {
          // Wait a bit for data channel to be ready if not immediately available
          const sendCaption = () => {
            if (dataChannelRef.current && dataChannelRef.current.readyState === "open") {
              const payload: CaptionPayload = {
                kind: "caption",
                text: latest,
                language: captionsLanguage,
                timestamp: Date.now(),
              };
              try {
                dataChannelRef.current.send(JSON.stringify(payload));
                console.log(`Sent caption (${roleRef.current}):`, latest);
              } catch (err) {
                console.error("Failed to send caption:", err);
              }
            } else {
              // Retry after a short delay if channel not ready yet
              setTimeout(() => {
                if (dataChannelRef.current && dataChannelRef.current.readyState === "open") {
                  const payload: CaptionPayload = {
                    kind: "caption",
                    text: latest,
                    language: captionsLanguage,
                    timestamp: Date.now(),
                  };
                  try {
                    dataChannelRef.current.send(JSON.stringify(payload));
                    console.log(`Sent caption (${roleRef.current}, retry):`, latest);
                  } catch (err) {
                    console.error("Failed to send caption on retry:", err);
                  }
                } else {
                  console.warn(`Data channel not ready (${roleRef.current}), caption not sent:`, latest);
                }
              }, 500);
            }
          };
          sendCaption();
        }
      };

      recognition.onerror = (event) => {
        const errorType = (event as any).error;
        // "network" errors are often transient - don't stop recognition for them
        // "no-speech" and "aborted" are also non-fatal
        if (errorType === "network" || errorType === "no-speech" || errorType === "aborted") {
          console.warn("Speech recognition transient error:", errorType);
          // Recognition will auto-restart via onend handler
          return;
        }
        // "audio-capture" means mic is in use - try again after a delay
        if (errorType === "audio-capture") {
          console.warn("Speech recognition audio-capture error - microphone may be in use, will retry on next end");
          // Don't stop recognition - let it end naturally and restart
          // The onend handler will restart it
          return;
        }
        // For other errors (like "not-allowed", "service-not-allowed"), stop recognition
        console.error("Speech recognition error:", errorType);
        stopRecognition();
      };

      recognition.onend = () => {
        // Restart automatically while connected for robustness.
        if (phase === "connected" && recognitionRef.current === recognition) {
          // Longer delay before restarting to give microphone time to be available
          // This helps with audio-capture errors
          setTimeout(() => {
            if (phase === "connected" && recognitionRef.current === recognition) {
              try {
                // Verify microphone is still available before restarting
                const audioTracks = localStreamRef.current?.getAudioTracks();
                if (audioTracks && audioTracks.length > 0 && audioTracks[0].readyState === "live") {
                  recognition.start();
                } else {
                  console.warn("Microphone not available, delaying recognition restart...");
                  // Try again after a longer delay
                  setTimeout(() => {
                    if (phase === "connected" && recognitionRef.current === recognition) {
                      try {
                        recognition.start();
                      } catch (err) {
                        console.error("Failed to restart recognition after delay:", err);
                        recognitionRef.current = null;
                      }
                    }
                  }, 2000);
                }
              } catch (err) {
                console.error("Failed to restart recognition:", err);
                recognitionRef.current = null;
              }
            }
          }, 500);
        } else {
          recognitionRef.current = null;
        }
      };

      // Verify microphone is accessible before starting recognition
      const verifyMicrophone = async () => {
        try {
          // Check if we have an active audio track
          const audioTracks = localStreamRef.current?.getAudioTracks();
          if (!audioTracks || audioTracks.length === 0) {
            console.warn("No audio track available for speech recognition");
            return false;
          }
          
          const audioTrack = audioTracks[0];
          if (audioTrack.readyState !== "live") {
            console.warn("Audio track is not live:", audioTrack.readyState);
            return false;
          }
          
          console.log("Microphone verified - audio track is live");
          return true;
        } catch (err) {
          console.error("Error verifying microphone:", err);
          return false;
        }
      };

      // Start recognition with a delay to ensure mic is ready
      const startRecognitionWithDelay = async () => {
        // Wait a bit longer to ensure microphone is fully available
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if still connected before starting
        if (phase !== "connected" || recognitionRef.current) {
          return;
        }

        const micReady = await verifyMicrophone();
        if (!micReady) {
          console.warn("Microphone not ready, will retry...");
          // Try again after a longer delay
          setTimeout(() => {
            if (phase === "connected" && !recognitionRef.current) {
              startRecognitionWithDelay();
            }
          }, 2000);
          return;
        }

        try {
          recognition.start();
          recognitionRef.current = recognition;
          console.log(`Speech recognition started (${roleRef.current}) with language:`, captionsLanguage);
        } catch (err) {
          console.error(`Failed to start recognition (${roleRef.current}):`, err);
          // If it fails with audio-capture, try again after a delay
          if (err instanceof Error && err.message.includes("audio")) {
            setTimeout(() => {
              if (phase === "connected" && !recognitionRef.current) {
                startRecognitionWithDelay();
              }
            }, 2000);
          } else {
            recognitionRef.current = null;
          }
        }
      };

      startRecognitionWithDelay();
    } else {
      stopRecognition();
    }
  }, [captionsSupported, captionsLanguage, phase, stopRecognition]);

  return {
    localVideoRef,
    remoteVideoRef,
    role,
    phase,
    error,
    isBusy,
    offerPayload,
    answerPayload,
    captionsSupported,
    captionsLanguage,
    localCaption,
    remoteCaption,
    remoteCaptionTranslated,
    translationLanguage,
    isTranslating,
    setCaptionsLanguage,
    setTranslationLanguage: handleSetTranslationLanguage,
    startAsHost,
    startAsGuest,
    createOffer,
    applyRemoteOfferAndCreateAnswer,
    applyRemoteAnswer,
    hangUp,
  };
}

