"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CallPhase =
  | "idle"
  | "media-ready"
  | "waiting-offer"
  | "waiting-answer"
  | "connected"
  | "ended";

export type Role = "host" | "guest" | null;

export interface UseTwoPersonCallResult {
  localVideoRef: React.RefObject<HTMLVideoElement>;
  remoteVideoRef: React.RefObject<HTMLVideoElement>;
  role: Role;
  phase: CallPhase;
  error: string | null;
  isBusy: boolean;
  offerPayload: string;
  answerPayload: string;
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

export function useTwoPersonCall(): UseTwoPersonCallResult {
  const [role, setRole] = useState<Role>(null);
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [offerPayload, setOfferPayload] = useState("");
  const [answerPayload, setAnswerPayload] = useState("");

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const resetState = useCallback(() => {
    setPhase("idle");
    setRole(null);
    setError(null);
    setIsBusy(false);
    setOfferPayload("");
    setAnswerPayload("");
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
  }, []);

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
      if (state === "disconnected" || state === "failed" || state === "closed") {
        setPhase("ended");
      }
    };

    pc.onicecandidateerror = () => {
      setError(
        "Network error while negotiating connection. Please check your network and try again.",
      );
    };

    pcRef.current = pc;

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
    await startLocalMedia();
    setPhase("waiting-offer");
  }, [startLocalMedia]);

  const startAsGuest = useCallback(async () => {
    setRole("guest");
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

    try {
      setIsBusy(true);
      const pc = ensurePeerConnection();

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
  }, [ensurePeerConnection, role]);

  const applyRemoteOfferAndCreateAnswer = useCallback(
    async (remoteOffer: string) => {
      if (role !== "guest") {
        setError("Only the guest can use a host's connection code.");
        return;
      }

      try {
        setIsBusy(true);
        const pc = ensurePeerConnection();

        const offer: RTCSessionDescriptionInit = JSON.parse(remoteOffer);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await waitForIceGatheringComplete(pc);

        const withIce = pc.localDescription;
        if (withIce) {
          setAnswerPayload(JSON.stringify(withIce));
        }

        setPhase("waiting-answer");
      } catch (err) {
        console.error(err);
        setError("The connection code looks invalid. Please check and try again.");
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
        const answer: RTCSessionDescriptionInit = JSON.parse(remoteAnswer);
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        setPhase("connected");
      } catch (err) {
        console.error(err);
        setError("The response code looks invalid. Please check and try again.");
      } finally {
        setIsBusy(false);
      }
    },
    [ensurePeerConnection, role],
  );

  const hangUp = useCallback(() => {
    cleanupPeerConnection();
    resetState();
  }, [cleanupPeerConnection, resetState]);

  useEffect(() => {
    return () => {
      cleanupPeerConnection();
    };
  }, [cleanupPeerConnection]);

  return {
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
  };
}

