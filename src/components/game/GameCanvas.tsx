"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createGame, type GameHandle } from "@/game/engine";
import { AudioManager } from "@/game/audio";
import { loadAssets, type AssetLoadResult } from "@/game/assets";
import { mergeConfig } from "@/game/difficulty";
import { DEFAULT_DIFFICULTY, LS_KEY_BEST, LS_KEY_MUTED } from "@/game/constants";
import type {
  EndReason,
  GameEvent,
  GameSnapshot,
  LoadProgress,
} from "@/game/types";
import { LoaderOverlay } from "./LoaderOverlay";
import { Hud } from "./Hud";
import { GameOverModal, type AchievementUnlocked } from "./GameOverModal";

type Phase = "loading" | "start" | "playing" | "gameover";

interface MeResponse {
  user?: { id: string; name?: string | null };
  bestScore?: number;
  preference?: { bgmMuted: boolean; sfxMuted: boolean };
}

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameHandle | null>(null);
  const audioRef = useRef<AudioManager | null>(null);
  const assetsRef = useRef<AssetLoadResult["images"]>({});
  const configRef = useRef(DEFAULT_DIFFICULTY);
  const sessionUserRef = useRef<MeResponse["user"]>(null);
  const snapshotRef = useRef<GameSnapshot | null>(null);
  const bestRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState<LoadProgress>({
    imagesLoaded: 0,
    imagesTotal: 8,
    audioLoaded: 0,
    audioTotal: 9,
  });
  const [audioFailedCount, setAudioFailedCount] = useState(0);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [best, setBest] = useState(0);
  const [muted, setMuted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [levelFlash, setLevelFlash] = useState<{ level: number; key: number } | null>(null);
  const [comboFlash, setComboFlash] = useState<{ text: string; key: number } | null>(null);
  const [gameOver, setGameOver] = useState<{ snapshot: GameSnapshot; reason: EndReason } | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [newAchievements, setNewAchievements] = useState<AchievementUnlocked[]>([]);

  const flashKeyRef = useRef(0);

  /* ---------- 初始化（只跑一次） ---------- */
  useEffect(() => {
    let disposed = false;

    // 本地最高分与静音偏好
    try {
      const storedBest = Number(localStorage.getItem(LS_KEY_BEST) ?? "0");
      if (Number.isFinite(storedBest) && storedBest > 0) {
        bestRef.current = storedBest;
        setBest(storedBest);
      }
      setMuted(localStorage.getItem(LS_KEY_MUTED) === "1");
    } catch {
      /* localStorage 不可用（隐私模式等）时忽略 */
    }

    const audio = new AudioManager();
    audioRef.current = audio;

    // 资源加载（图片 + 音频，汇报进度）
    void loadAssets(
      (onAudioProgress) => audio.load(onAudioProgress),
      (p) => {
        if (!disposed) setProgress(p);
      }
    ).then((result) => {
      if (disposed) return;
      assetsRef.current = result.images;
      setAudioFailedCount(result.audioFailed.length);
      setPhase("start");
    });

    // 难度配置：GET /api/config，失败回落 DEFAULT_DIFFICULTY；按 version 缓存到 sessionStorage
    void (async () => {
      let cfg = DEFAULT_DIFFICULTY;
      try {
        const res = await fetch("/api/config", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { config?: unknown; json?: unknown; version?: number };
          cfg = mergeConfig(data.config ?? data.json ?? null);
          try {
            sessionStorage.setItem(
              "sliceninja.config",
              JSON.stringify({ version: data.version ?? 1, config: cfg })
            );
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* 网络失败 → 默认难度 */
      }
      configRef.current = cfg;
    })();

    // 登录态：用户信息 / 最高分 / 偏好
    void (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (res.ok) {
          const me = (await res.json()) as MeResponse;
          if (me.user) sessionUserRef.current = me.user;
          if (typeof me.bestScore === "number" && me.bestScore > bestRef.current) {
            bestRef.current = me.bestScore;
            setBest(me.bestScore);
          }
          if (me.preference && (me.preference.bgmMuted || me.preference.sfxMuted)) {
            setMuted(true);
          }
        }
      } catch {
        /* 游客 */
      }
    })();

    return () => {
      disposed = true;
      audio.destroy();
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  /* 静音状态同步到 AudioManager */
  useEffect(() => {
    audioRef.current?.setMuted(muted);
  }, [muted]);

  /* 切后台自动暂停 */
  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) return;
      const snap = snapshotRef.current;
      if (snap?.state === "running") engineRef.current?.pause();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  /* toast 自动消失 */
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  /* ---------- 对局提交（Game Over 且已登录时恰好一次） ---------- */
  const submitSession = useCallback(async (snap: GameSnapshot, reason: EndReason) => {
    const user = sessionUserRef.current;
    if (!user) return; // 游客不自动提交
    setSaveState("saving");
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          score: snap.score,
          maxCombo: snap.maxCombo,
          levelReached: snap.level,
          fruitsSliced: snap.fruitsSliced,
          fruitsMissed: snap.fruitsMissed,
          bombsHit: snap.bombsHit,
          durationMs: snap.elapsedMs,
          endedReason: reason,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setSaveState("error");
        setToast(data?.error ?? "成绩保存失败");
        return;
      }
      const data = (await res.json()) as { newAchievements?: AchievementUnlocked[] };
      setSaveState("saved");
      setNewAchievements(data.newAchievements ?? []);
    } catch {
      setSaveState("error");
      setToast("网络异常，成绩未保存");
    }
  }, []);

  /* ---------- 引擎事件 → 音效 + UI 反馈 ---------- */
  const handleEvent = useCallback(
    (e: GameEvent) => {
      const audio = audioRef.current;
      if (!audio) return;
      switch (e.type) {
        case "slice":
          audio.playSlice();
          break;
        case "bomb":
          audio.play("bomb");
          break;
        case "miss":
          audio.play("miss");
          break;
        case "combo": {
          audio.play("combo");
          flashKeyRef.current += 1;
          setComboFlash({ text: `COMBO ×${e.count}`, key: flashKeyRef.current });
          break;
        }
        case "levelup": {
          audio.play("level-up");
          flashKeyRef.current += 1;
          setLevelFlash({ level: e.level, key: flashKeyRef.current });
          break;
        }
        case "end": {
          audio.play("game-over");
          audio.setBgm(false);
          const snap = engineRef.current?.getSnapshot() ?? null;
          if (snap) {
            // 本地最高分
            if (snap.score > bestRef.current) {
              bestRef.current = snap.score;
              setBest(snap.score);
              try {
                localStorage.setItem(LS_KEY_BEST, String(snap.score));
              } catch {
                /* ignore */
              }
            }
            setGameOver({ snapshot: snap, reason: e.reason });
            setPhase("gameover");
            void submitSession(snap, e.reason);
          }
          break;
        }
      }
    },
    [submitSession]
  );

  const handleSnapshot = useCallback((s: GameSnapshot) => {
    snapshotRef.current = s;
    setSnapshot(s);
  }, []);

  /* ---------- 开局 / 重开 ---------- */
  const startEngine = useCallback(() => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas) return;
    audio.unlock(); // 首次用户手势内解锁 AudioContext（见 audio.ts 顶部注释）
    if (!engineRef.current) {
      engineRef.current = createGame(canvas, {
        config: configRef.current,
        audio,
        assets: { images: assetsRef.current },
        onSnapshot: handleSnapshot,
        onEvent: handleEvent,
      });
    }
    engineRef.current.start();
    audio.setBgm(true);
    setGameOver(null);
    setNewAchievements([]);
    setSaveState("idle");
    setPhase("playing");
  }, [handleSnapshot, handleEvent]);

  const togglePause = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (snapshotRef.current?.state === "running") engine.pause();
    else engine.resume();
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      audioRef.current?.setMuted(next);
      try {
        localStorage.setItem(LS_KEY_MUTED, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      if (sessionUserRef.current) {
        void fetch("/api/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bgmMuted: next, sfxMuted: next }),
        }).catch(() => undefined);
      }
      return next;
    });
  }, []);

  const paused = snapshot?.state === "paused";
  const showHud = phase === "playing" || phase === "gameover";
  const canPause = snapshot?.state === "running" || snapshot?.state === "paused";

  return (
    <div className="flex min-h-0 w-full max-w-5xl flex-1 flex-col items-center justify-center px-2 py-2 sm:px-4">
      <div className="relative w-full select-none overflow-hidden rounded-xl border border-gold/20 shadow-2xl shadow-black/60">
        <canvas
          ref={canvasRef}
          className="block h-auto w-full cursor-crosshair rounded-xl"
          style={{ touchAction: "none", aspectRatio: "16 / 9" }}
          aria-label="游戏画布：滑动切割水果，避开炸弹"
        />

        {/* 加载遮罩 */}
        {phase === "loading" || phase === "start" ? (
          <LoaderOverlay
            progress={progress}
            done={phase === "start"}
            audioFailedCount={audioFailedCount}
            onStart={startEngine}
          />
        ) : null}

        {/* HUD */}
        {showHud ? (
          <Hud
            snapshot={snapshot}
            best={best}
            muted={muted}
            paused={paused}
            onToggleMute={toggleMute}
            onTogglePause={togglePause}
            canPause={canPause}
          />
        ) : null}

        {/* Level Up / Combo 大字 */}
        {levelFlash ? (
          <div
            key={levelFlash.key}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <span className="flash-text font-serif-display text-6xl font-black text-gold drop-shadow-[0_0_24px_rgba(240,181,66,0.7)]">
              LEVEL {levelFlash.level}
            </span>
          </div>
        ) : null}
        {comboFlash ? (
          <div
            key={comboFlash.key}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <span className="flash-text font-serif-display text-5xl font-black text-antique drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]">
              {comboFlash.text}
            </span>
          </div>
        ) : null}

        {/* 暂停遮罩 */}
        {paused ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
            <p className="font-serif-display text-4xl font-black text-antique/90">
              已暂停
            </p>
          </div>
        ) : null}

        {/* Game Over */}
        {gameOver && phase === "gameover" ? (
          <GameOverModal
            snapshot={gameOver.snapshot}
            reason={gameOver.reason}
            best={best}
            saveState={saveState}
            newAchievements={newAchievements}
            onRestart={startEngine}
          />
        ) : null}

        {/* Toast */}
        {toast ? (
          <div className="absolute bottom-3 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-ember/50 bg-wood-950/90 px-4 py-2 text-sm text-ember shadow-lg">
            {toast}
          </div>
        ) : null}
      </div>
    </div>
  );
}
