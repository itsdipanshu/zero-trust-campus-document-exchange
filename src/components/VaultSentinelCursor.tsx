"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { usePathname } from "next/navigation";

interface TrailPoint {
  x: number;
  y: number;
  alpha: number;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
}

type CursorState = "default" | "button" | "link" | "card" | "document" | "disabled" | "text" | "hidden";

export function VaultSentinelCursor() {
  const pathname = usePathname();
  const isAiAssistant = pathname?.includes("/ai-assistant");

  const [active, setActive] = useState(false);
  const [cursorState, setCursorState] = useState<CursorState>("default");
  const [ripples, setRipples] = useState<Ripple[]>([]);

  // Positions for smooth physics
  const mousePos = useRef({ x: -100, y: -100 });
  const ringPos = useRef({ x: -100, y: -100 });
  const isVisible = useRef(false);
  const trailRef = useRef<TrailPoint[]>([]);

  // DOM Refs for direct transform without React re-render lag
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const trailContainerRef = useRef<HTMLDivElement>(null);
  const rafId = useRef<number | null>(null);

  // 1. Accessibility and Touch Device Safety Check
  useEffect(() => {
    if (typeof window === "undefined") return;

    const isTouch = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (isTouch || prefersReducedMotion) {
      setActive(false);
      return;
    }

    setActive(true);
    document.documentElement.classList.add("vault-sentinel-active");

    return () => {
      document.documentElement.classList.remove("vault-sentinel-active");
    };
  }, []);

  // 2. Interactive Element State Detection
  const handleMouseOver = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // Check if over text inputs
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable ||
      target.closest("input") ||
      target.closest("textarea")
    ) {
      setCursorState("text");
      return;
    }

    // Check if over disabled controls
    if (
      target.hasAttribute("disabled") ||
      target.getAttribute("aria-disabled") === "true" ||
      target.closest(":disabled") ||
      target.closest("[disabled]")
    ) {
      setCursorState("disabled");
      return;
    }

    // Check if over document elements
    if (
      target.closest("[data-cursor='document']") ||
      target.closest(".doc-card") ||
      target.closest("[data-doc-id]") ||
      target.getAttribute("data-cursor") === "document"
    ) {
      setCursorState("document");
      return;
    }

    // Check if over clickable cards
    if (
      target.closest(".card-hover") ||
      target.closest("[data-cursor='card']") ||
      target.getAttribute("data-cursor") === "card"
    ) {
      setCursorState("card");
      return;
    }

    // Check if over buttons
    if (
      target.tagName === "BUTTON" ||
      target.closest("button") ||
      target.classList.contains("btn-primary") ||
      target.classList.contains("btn-secondary") ||
      target.classList.contains("btn-highlight") ||
      target.classList.contains("btn-danger") ||
      target.closest(".btn-primary") ||
      target.closest(".btn-secondary")
    ) {
      setCursorState("button");
      return;
    }

    // Check if over links
    if (target.tagName === "A" || target.closest("a") || target.getAttribute("role") === "link") {
      setCursorState("link");
      return;
    }

    setCursorState("default");
  }, []);

  // 3. Movement and Click Listeners
  useEffect(() => {
    if (!active) return;

    const handleMouseMove = (e: MouseEvent) => {
      mousePos.current.x = e.clientX;
      mousePos.current.y = e.clientY;
      isVisible.current = true;

      // Update AI Assistant trailing points
      if (isAiAssistant) {
        trailRef.current.push({ x: e.clientX, y: e.clientY, alpha: 0.65 });
        if (trailRef.current.length > 7) {
          trailRef.current.shift();
        }
      }
    };

    const handleMouseLeave = () => {
      isVisible.current = false;
      setCursorState("hidden");
    };

    const handleMouseEnter = () => {
      isVisible.current = true;
      setCursorState("default");
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (cursorState === "text") return;
      const newRipple: Ripple = {
        id: Date.now() + Math.random(),
        x: e.clientX,
        y: e.clientY,
      };
      setRipples((prev) => [...prev.slice(-3), newRipple]);
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mouseover", handleMouseOver, { passive: true });
    document.addEventListener("mouseleave", handleMouseLeave);
    document.addEventListener("mouseenter", handleMouseEnter);
    window.addEventListener("mousedown", handleMouseDown);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseover", handleMouseOver);
      document.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("mouseenter", handleMouseEnter);
      window.removeEventListener("mousedown", handleMouseDown);
    };
  }, [active, cursorState, isAiAssistant, handleMouseOver]);

  // Clean up ripples after animation
  useEffect(() => {
    if (ripples.length === 0) return;
    const timer = setTimeout(() => {
      setRipples((prev) => prev.slice(1));
    }, 450);
    return () => clearTimeout(timer);
  }, [ripples]);

  // 4. Smooth Physics Loop via requestAnimationFrame (Linear Interpolation)
  useEffect(() => {
    if (!active) return;

    const loop = () => {
      // Lerp ring towards mouse position (0.16 = smooth spring feel)
      const speed = 0.16;
      ringPos.current.x += (mousePos.current.x - ringPos.current.x) * speed;
      ringPos.current.y += (mousePos.current.y - ringPos.current.y) * speed;

      // Update Dot
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${mousePos.current.x}px, ${mousePos.current.y}px, 0) translate(-50%, -50%)`;
        dotRef.current.style.opacity = isVisible.current && cursorState !== "text" && cursorState !== "hidden" ? "1" : "0";
      }

      // Update Ring
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ringPos.current.x}px, ${ringPos.current.y}px, 0) translate(-50%, -50%)`;
        ringRef.current.style.opacity = isVisible.current && cursorState !== "text" && cursorState !== "hidden" ? "1" : "0";
      }

      // Update Trail for AI Assistant
      if (trailContainerRef.current && isAiAssistant) {
        const trailElements = trailContainerRef.current.children;
        for (let i = 0; i < trailElements.length; i++) {
          const el = trailElements[i] as HTMLDivElement;
          const pt = trailRef.current[i];
          if (pt) {
            el.style.transform = `translate3d(${pt.x}px, ${pt.y}px, 0) translate(-50%, -50%)`;
            el.style.opacity = `${(i + 1) * 0.08}`;
          }
        }
      }

      rafId.current = requestAnimationFrame(loop);
    };

    rafId.current = requestAnimationFrame(loop);

    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [active, cursorState, isAiAssistant]);

  if (!active) return null;

  // Determine state-based ring styles
  let ringClasses = "border-[#477B70]/80 bg-[#477B70]/5";
  let ringSize = "w-7 h-7";
  let ringScale = "scale-100";
  let showShield = false;
  let showDisabled = false;

  if (isAiAssistant) {
    ringClasses = "border-[#35635C] bg-[#5C8F84]/15 shadow-[0_0_12px_rgba(71,123,112,0.35)]";
  }

  switch (cursorState) {
    case "button":
      ringSize = "w-10 h-10";
      ringClasses = isAiAssistant
        ? "border-[#477B70] bg-[#477B70]/20 shadow-[0_0_15px_rgba(71,123,112,0.4)]"
        : "border-[#C18B52] bg-[#C18B52]/15 shadow-[0_0_12px_rgba(193,139,82,0.35)]";
      break;
    case "link":
      ringSize = "w-8 h-8";
      ringClasses = "border-[#477B70] bg-[#477B70]/10";
      break;
    case "card":
      ringSize = "w-9 h-9";
      ringClasses = "border-[#75978A]/80 bg-[#75978A]/10";
      break;
    case "document":
      ringSize = "w-9 h-9";
      ringClasses = "border-[#325C53] bg-[#EAF1EE] shadow-[0_0_12px_rgba(50,92,83,0.2)]";
      showShield = true;
      break;
    case "disabled":
      ringSize = "w-6 h-6";
      ringClasses = "border-rose-400/80 bg-rose-500/10";
      showDisabled = true;
      break;
    default:
      break;
  }

  return (
    <div className="vault-sentinel-cursor-container fixed inset-0 pointer-events-none z-[99999] overflow-hidden select-none">
      {/* 1. AI Assistant Subtle Trail Particles */}
      {isAiAssistant && (
        <div ref={trailContainerRef} className="trail-particles">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full bg-[#477B70] pointer-events-none transition-opacity duration-150"
              style={{ transform: "translate3d(-100px, -100px, 0)" }}
            />
          ))}
        </div>
      )}

      {/* 2. Outer Sentinel Ring (Smooth Lerp Physics) */}
      <div
        ref={ringRef}
        className={`fixed top-0 left-0 rounded-full border border-solid transition-all duration-200 ease-out flex items-center justify-center pointer-events-none ${ringSize} ${ringClasses} ${ringScale}`}
        style={{
          willChange: "transform",
        }}
      >
        {/* Subtle crosshair / radar tick marks on default & card state */}
        {cursorState === "default" && (
          <div className="absolute inset-0 rounded-full border border-[#477B70]/20 animate-ping opacity-25" />
        )}

        {/* Document Hover State: Mini Sentinel Shield */}
        {showShield && (
          <svg
            className="w-4 h-4 text-[#325C53] animate-fade-in"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        )}

        {/* Disabled State: Mini Slash/Lock */}
        {showDisabled && (
          <svg
            className="w-3.5 h-3.5 text-rose-500 animate-fade-in"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
        )}
      </div>

      {/* 3. Central Sentinel Emerald Dot (Instant Tracking) */}
      <div
        ref={dotRef}
        className={`fixed top-0 left-0 pointer-events-none transition-colors duration-150 ${
          showShield || showDisabled
            ? "opacity-0"
            : isAiAssistant
            ? "w-2 h-2 rounded-full bg-[#35635C] shadow-[0_0_6px_#477B70]"
            : "w-1.5 h-1.5 rounded-full bg-[#183A35]"
        }`}
        style={{
          willChange: "transform",
        }}
      />

      {/* 4. Click Ripples */}
      {ripples.map((rip) => (
        <div
          key={rip.id}
          className="fixed rounded-full border border-[#477B70]/70 pointer-events-none animate-sentinel-ripple"
          style={{
            left: rip.x,
            top: rip.y,
            width: "32px",
            height: "32px",
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
    </div>
  );
}
