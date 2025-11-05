// src/lib/useQxVoice.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { Conversation } from "@elevenlabs/client";

type Status = "disconnected" | "connecting" | "connected";
type Mode = "idle" | "listening" | "speaking";

const KEY_CONV = "qx:voice:conversationId";

export function useQxVoice(
  apiBase = import.meta.env.VITE_API_BASE_URL || "https://quantnow-sa1e.onrender.com"
) {
  const convRef = useRef<Conversation | null>(null);
  const [status, setStatus] = useState<Status>("disconnected");
  const [mode, setMode] = useState<Mode>("idle");
  const [ready, setReady] = useState(false);
  const [lastUserText, setLastUserText] = useState("");
  const [lastAgentText, setLastAgentText] = useState("");
  const [canSendFeedback, setCanSendFeedback] = useState(false);

  useEffect(() => {
    const ok = typeof window !== "undefined" && window.isSecureContext && !!navigator.mediaDevices;
    setReady(ok);
  }, []);

  function sanitizeCachedId(id?: string | null) {
    if (!id) return undefined;
    const s = String(id);
    // ▶ drop obviously-bad values (what was causing your “get-webrtc-token” reuse)
    if (s.length < 10 || /get-webrtc-token|^https?:\/\//i.test(s)) return undefined;
    return s;
  }

  async function requestSession(conversationId?: string) {
    const token = localStorage.getItem("token") || "";
    const activeCompanyId =
      localStorage.getItem("activeCompanyId") || localStorage.getItem("companyId") || "";

    const r = await fetch(`${apiBase}/voice/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(activeCompanyId ? { "X-Company-Id": activeCompanyId } : {}),
      },
      body: JSON.stringify({ conversationId }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = data?.detail?.message || data?.error || "Failed to start voice session";
      throw new Error(msg);
    }

    // ▶ Persist fresh conversationId (only if it looks legit)
    if (data?.conversationId && sanitizeCachedId(data.conversationId)) {
      localStorage.setItem(KEY_CONV, data.conversationId);
    }
    return data as {
      conversationToken: string;
      conversationId?: string;
      iceServers?: RTCIceServer[];
    };
  }

  const start = useCallback(async () => {
    if (!ready || status !== "disconnected") return;

    setStatus("connecting");

    await navigator.mediaDevices.getUserMedia({ audio: true }).catch((e) => {
      console.error("Mic permission denied:", e);
      setStatus("disconnected");
      throw e;
    });

    // ▶ sanitize before using cached id
    const cachedRaw = localStorage.getItem(KEY_CONV) || undefined;
    const cached = sanitizeCachedId(cachedRaw);

    let session;
    try {
      session = await requestSession(cached);
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (cached && /conversation.*not.*found|forbidden|history/i.test(msg)) {
        localStorage.removeItem(KEY_CONV);
        session = await requestSession(undefined);
      } else {
        setStatus("disconnected");
        throw e;
      }
    }

    const { conversationToken } = session;
    if (!conversationToken) {
      setStatus("disconnected");
      throw new Error("No conversation token returned.");
    }

    const conversation = await Conversation.startSession({
      conversationToken,
      connectionType: "webrtc",
      onConnect: () => setStatus("connected"),
      onDisconnect: () => { setStatus("disconnected"); setMode("idle"); },
      onError: (err) => { console.error("ElevenLabs error:", err); setStatus("disconnected"); setMode("idle"); },
      onStatusChange: (s) => setStatus(s as Status),
      onModeChange: (m) => setMode(m as Mode),
      onMessage: (msg) => {
        if (msg?.type === "user") setLastUserText(msg.text || "");
        else if (msg?.type === "agent") setLastAgentText(msg.text || "");
      },
      onCanSendFeedbackChange: (flag) => setCanSendFeedback(flag),
    });

    convRef.current = conversation;
  }, [apiBase, ready, status]);

  const stop = useCallback(async () => {
    if (convRef.current) {
      await convRef.current.endSession().catch(() => {});
      convRef.current = null;
    }
    setStatus("disconnected");
    setMode("idle");
  }, []);

  const mute = useCallback(async () => { if (convRef.current) await convRef.current.setMicMuted(true); }, []);
  const unmute = useCallback(async () => { if (convRef.current) await convRef.current.setMicMuted(false); }, []);
  const sendText = useCallback(async (text: string) => { if (text?.trim() && convRef.current) await convRef.current.sendUserMessage(text.trim()); }, []);
  const sendFeedback = useCallback(async (positive: boolean) => { if (convRef.current && canSendFeedback) await convRef.current.sendFeedback(positive); }, [canSendFeedback]);

  useEffect(() => {
    return () => { if (convRef.current) convRef.current.endSession().catch(() => {}); convRef.current = null; };
  }, []);

  return {
    ready,
    status,
    mode,
    speaking: mode === "speaking",
    lastUserText,
    lastAgentText,
    canSendFeedback,
    start,
    stop,
    mute,
    unmute,
    sendText,
    sendFeedback,
  };
}
