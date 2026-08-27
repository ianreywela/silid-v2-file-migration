"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export type TerminalLogEntry = {
  id: string;
  tag: string;
  message: string;
  createdAt: string;
};

const STICKY_THRESHOLD_PX = 48;

function formatTimestamp(value: string) {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function tagColor(tag: string) {
  switch (tag.toUpperCase()) {
    case "START":
    case "DONE":
    case "OK":
      return "text-emerald-400";
    case "COLLECT":
    case "JSON":
      return "text-sky-400";
    case "TRANSFER":
      return "text-amber-300";
    case "SKIP":
      return "text-white/50";
    case "ERROR":
    case "PAUSE":
      return "text-red-400";
    default:
      return "text-violet-300";
  }
}

function isNearBottom(container: HTMLDivElement) {
  const distanceFromBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight;
  return distanceFromBottom <= STICKY_THRESHOLD_PX;
}

type TerminalLogViewerProps = {
  title?: string;
  subtitle?: string;
  logs: TerminalLogEntry[];
  emptyMessage?: string;
};

export function TerminalLogViewer({
  title = "migration.log",
  subtitle,
  logs,
  emptyMessage = "Waiting for log output...",
}: TerminalLogViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
  }

  function handleScroll() {
    const container = scrollRef.current;
    if (!container) return;

    const pinned = isNearBottom(container);
    stickToBottomRef.current = pinned;
    setShowJumpToLatest(!pinned);
  }

  useEffect(() => {
    if (stickToBottomRef.current) {
      scrollToBottom();
    } else {
      setShowJumpToLatest(true);
    }
  }, [logs]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-black/35 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/8 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="text-center">
          <p className="font-mono text-xs text-white/50">{title}</p>
          {subtitle ? <p className="font-mono text-[10px] text-white/40">{subtitle}</p> : null}
        </div>
        <div className="w-[52px]" />
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="glass-scrollbar max-h-96 overflow-x-hidden overflow-y-auto px-4 py-3 font-mono text-[13px] leading-6 text-white/90"
      >
        {logs.length === 0 ? (
          <p className="text-white/40">{emptyMessage}</p>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="break-words [overflow-wrap:anywhere] whitespace-pre-wrap"
            >
              <span className="text-white/40">{formatTimestamp(log.createdAt)}</span>{" "}
              <span className={tagColor(log.tag)}>[{log.tag}]</span>{" "}
              <span className="text-white/90">{log.message}</span>
            </div>
          ))
        )}
        <div className="mt-1 flex items-center gap-1 text-emerald-400">
          <span className="text-white/40">$</span>
          <span className="inline-block h-4 w-2 animate-pulse bg-emerald-400/80" />
        </div>
      </div>

      {showJumpToLatest ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="pointer-events-auto shadow-lg"
            onClick={() => scrollToBottom("smooth")}
          >
            Jump to latest
          </Button>
        </div>
      ) : null}
    </div>
  );
}
