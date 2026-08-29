"use client";

import { useState } from "react";

/**
 * 管理员配置编辑（很简陋即可：textarea JSON + 保存，见 AGENTS.md）。
 * 提交 PUT /api/config，成功显示新 version。
 */
export function ConfigEditor({
  initialJson,
  initialVersion,
  initialUpdatedAt,
}: {
  initialJson: string;
  initialVersion: number;
  initialUpdatedAt: string | null;
}) {
  const [text, setText] = useState(initialJson);
  const [version, setVersion] = useState(initialVersion);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const handleSave = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setStatus("error");
      setMessage("JSON 解析失败，请检查语法");
      return;
    }

    setStatus("saving");
    setMessage(null);
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        version?: number;
        error?: string;
      } | null;
      if (!res.ok || !data?.ok) {
        setStatus("error");
        setMessage(data?.error ?? "保存失败");
        return;
      }
      setStatus("ok");
      setVersion(data.version ?? version);
      setUpdatedAt(new Date().toISOString());
      setMessage(`已保存，当前 version=${data.version ?? version}（新对局生效）`);
    } catch {
      setStatus("error");
      setMessage("网络错误，保存失败");
    }
  };

  return (
    <div className="card-wood rounded-xl p-5">
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="text-parchment/80">
          当前 version：<span className="font-num font-bold text-gold">{version}</span>
          {updatedAt ? (
            <span className="ml-3 text-parchment/50">更新于 {new Date(updatedAt).toLocaleString("zh-CN")}</span>
          ) : null}
        </span>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        rows={22}
        className="w-full rounded-lg border border-gold/20 bg-black/40 p-3 font-mono text-xs leading-5 text-antique outline-none focus:border-gold/60"
      />

      {message ? (
        <p
          className={`mt-3 text-sm ${status === "ok" ? "text-leaf" : "text-ember"}`}
        >
          {message}
        </p>
      ) : null}

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={status === "saving"}
          className="btn-gold rounded-lg px-8 py-2.5 font-bold disabled:opacity-60"
        >
          {status === "saving" ? "保存中…" : "保存并发布"}
        </button>
        <button
          type="button"
          onClick={() => setText(initialJson)}
          className="btn-ghost rounded-lg px-6 py-2.5 font-bold"
        >
          恢复默认
        </button>
      </div>

      <p className="mt-4 text-xs leading-5 text-parchment/60">
        说明：可只填要覆盖的字段（如{" "}
        <code className="text-gold/80">
          {"{ \"spawnIntervalMs\": { \"base\": 900, \"perLevel\": -60, \"min\": 400 } }"}
        </code>
        ），保存时与默认配置合并；修改后客户端进入 /play 时自动拉取新配置，version 自增。
      </p>
    </div>
  );
}
