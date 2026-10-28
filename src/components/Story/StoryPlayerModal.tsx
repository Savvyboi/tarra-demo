import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  Bookmark,
  Calendar,
  CalendarPlus,
  Clock,
  ExternalLink,
  Info,
  MapPin,
  Map as MapIcon,
  Navigation,
  Pause,
  Play,
  Share2,
  ShieldCheck,
  Ticket,
  X,
  ChevronLeft,
  ChevronRight,
  Check,
} from 'lucide-react';
import { CITIES, TOPICS } from '../../config/cities';
import {
  NormalizedEvent,
  VenueStoryGroup,
} from '../../types/linkedEvents';
import {
  buildGoogleCalendarUrl,
  downloadEventIcs,
  formatEventTimeLabel,
  resolveEventOccurrence,
} from '../../utils/calendarUtils';
import { formatDistance } from '../../utils/distanceUtils';
import {
  CC_BY_4_URL,
  getSafeEventImageUrl,
} from '../../utils/licenseGuard';
import { sanitizeEventHtml } from '../../utils/sanitizeHtml';

// Modern Web Guidance (animate-to-from-top-layer): Probe discrete display transition support
let supportsDisplayTransition: boolean | undefined;
function canTransitionDisplay(): boolean {
  if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
  if (
    !window.CSS?.supports?.('transition-behavior', 'allow-discrete') ||
    !document.body
  ) {
    return false;
  }
  const probe = document.createElement('div');
  probe.style.cssText =
    'transition: display 1s allow-discrete !important; display: block;';
  document.body.appendChild(probe);
  void getComputedStyle(probe).display;
  probe.style.display = 'none';
  supportsDisplayTransition = getComputedStyle(probe).display === 'block';
  probe.remove();
  return supportsDisplayTransition;
}

function supportsTopLayerExit(): boolean {
  return Boolean(
    window.CSS?.supports?.('overlay', 'auto') && canTransitionDisplay()
  );
}

async function closeTopLayer(element: HTMLDialogElement): Promise<void> {
  if (!supportsTopLayerExit()) {
    element.setAttribute('data-closing', '');
    const animations = element.getAnimations({ subtree: true });
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise((r) => setTimeout(r, 2000)),
      ]);
    }
    if (!element.hasAttribute('data-closing')) return;
    element.removeAttribute('data-closing');
  }
  element.close();
}

export interface StoryPlayerModalProps {
  venueGroup: VenueStoryGroup | null;
  initialEventId?: string | null;
  selectedDate?: string | null;
  now?: Date;
  savedEventIds: string[];
  onToggleSaveEvent: (eventId: string, eventObj?: NormalizedEvent) => void;
  onShowOnMap?: (event: NormalizedEvent) => void;
  onClose: () => void;
  onActiveEventChange: (eventId: string) => void;
  onShareDeepLink: (
    event: NormalizedEvent
  ) => Promise<{ ok: boolean; url: string }>;
  onNextVenue?: () => void;
  onPrevVenue?: () => void;
}

const STORY_DURATION_MS = 12000;

function prefersReducedMotionDefault(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

interface PlayerSessionState {
  key: string;
  activeEventId: string | null;
  activeIndex: number;
  progress: number;
  drawerOpen: boolean;
  isPaused: boolean;
  holdPaused: boolean;
}

export const StoryPlayerModal: React.FC<StoryPlayerModalProps> = ({
  venueGroup,
  initialEventId,
  selectedDate = null,
  now: nowProp,
  savedEventIds,
  onToggleSaveEvent,
  onShowOnMap,
  onClose,
  onActiveEventChange,
  onShareDeepLink,
  onNextVenue,
  onPrevVenue,
}) => {
  const now = useMemo(() => nowProp ?? new Date(), [nowProp]);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const events = useMemo(() => venueGroup?.events ?? [], [venueGroup]);
  const venueId = venueGroup?.venueId ?? null;
  const sessionKey = venueId ? `${venueId}|${initialEventId ?? ''}` : '';

  const defaultStartIndex = useMemo(() => {
    if (!initialEventId || events.length === 0) return 0;
    const idx = events.findIndex(
      (e) => e.id === initialEventId || e.aliasIds.includes(initialEventId)
    );
    return idx >= 0 ? idx : 0;
  }, [events, initialEventId]);

  const buildDefaultSession = useCallback(
    (key: string): PlayerSessionState => ({
      key,
      activeEventId: events[defaultStartIndex]?.id ?? null,
      activeIndex: defaultStartIndex,
      progress: 0,
      drawerOpen: false,
      isPaused: prefersReducedMotionDefault(),
      holdPaused: false,
    }),
    [events, defaultStartIndex]
  );

  const [sessionState, setSessionState] = useState<PlayerSessionState>(() =>
    buildDefaultSession(sessionKey)
  );

  const currentSession =
    sessionState.key === sessionKey
      ? sessionState
      : buildDefaultSession(sessionKey);

  const updateSession = useCallback(
    (
      updater: (prev: PlayerSessionState) => Partial<PlayerSessionState>
    ) => {
      setSessionState((prev) => {
        const base =
          prev.key === sessionKey ? prev : buildDefaultSession(sessionKey);
        return { ...base, ...updater(base) };
      });
    },
    [sessionKey, buildDefaultSession]
  );

  const [isDocumentHidden, setIsDocumentHidden] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [failedImgEventId, setFailedImgEventId] = useState<string | null>(null);
  const [shareFallback, setShareFallback] = useState<{
    eventId: string;
    url: string;
  } | null>(null);

  // Preserve exact event across 60s refreshes even if venue events array reorders (`BUG-01`)
  const safeIndex = useMemo(() => {
    if (events.length === 0) return 0;
    if (currentSession.activeEventId) {
      const byIdIdx = events.findIndex(
        (e) => e.id === currentSession.activeEventId
      );
      if (byIdIdx >= 0) return byIdIdx;
    }
    return Math.min(currentSession.activeIndex, events.length - 1);
  }, [events, currentSession.activeEventId, currentSession.activeIndex]);

  const progress = currentSession.progress;
  const isPaused = currentSession.isPaused;
  const holdPaused = currentSession.holdPaused;
  const drawerOpen = currentSession.drawerOpen;

  const currentEvent: NormalizedEvent | undefined =
    events[safeIndex] || events[0];
  const currentEventId = currentEvent?.id ?? null;

  const imgError = Boolean(currentEventId && failedImgEventId === currentEventId);
  const shareFallbackUrl =
    currentEventId && shareFallback?.eventId === currentEventId
      ? shareFallback.url
      : null;

  // Notify parent of active flyer event ID for URL synchronization (`BUG-01`)
  useEffect(() => {
    if (currentEventId) {
      onActiveEventChange(currentEventId);
    }
  }, [currentEventId, onActiveEventChange]);

  // Pause story timer when browser tab is hidden
  useEffect(() => {
    const onVisibilityChange = () => {
      setIsDocumentHidden(document.hidden);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const isOpen = Boolean(venueGroup);

  // Open/close native <dialog> using showModal() and register light-dismiss + exit animation fallbacks
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        previousFocusRef.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        dialog.removeAttribute('data-closing');
        dialog.showModal();
      }
    } else if (dialog.open) {
      void closeTopLayer(dialog);
    }

    const handleNativeClose = () => {
      onClose();
      if (previousFocusRef.current && previousFocusRef.current.isConnected) {
        previousFocusRef.current.focus();
      }
    };

    const handleCancel = (event: Event) => {
      event.preventDefault();
      void closeTopLayer(dialog);
    };

    // Fallback for browsers without declarative <dialog closedby="any"> support
    const handleBackdropClick = (event: MouseEvent) => {
      if ('closedBy' in HTMLDialogElement.prototype) return;
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isDialogContent =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (isDialogContent) return;
      void closeTopLayer(dialog);
    };

    dialog.addEventListener('close', handleNativeClose);
    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('click', handleBackdropClick);

    return () => {
      dialog.removeEventListener('close', handleNativeClose);
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('click', handleBackdropClick);
    };
  }, [isOpen, onClose]);

  const goNext = useCallback(() => {
    if (!venueGroup) return;
    if (safeIndex < venueGroup.events.length - 1) {
      const nextIdx = safeIndex + 1;
      updateSession(() => ({
        activeIndex: nextIdx,
        activeEventId: venueGroup.events[nextIdx]?.id ?? null,
        progress: 0,
        drawerOpen: false,
      }));
    } else if (onNextVenue) {
      onNextVenue();
    } else if (dialogRef.current) {
      void closeTopLayer(dialogRef.current);
    }
  }, [safeIndex, venueGroup, onNextVenue, updateSession]);

  const goPrev = useCallback(() => {
    if (!venueGroup) return;
    if (safeIndex > 0) {
      const prevIdx = safeIndex - 1;
      updateSession(() => ({
        activeIndex: prevIdx,
        activeEventId: venueGroup.events[prevIdx]?.id ?? null,
        progress: 0,
        drawerOpen: false,
      }));
    } else if (onPrevVenue) {
      onPrevVenue();
    } else {
      updateSession(() => ({ progress: 0 }));
    }
  }, [safeIndex, venueGroup, onPrevVenue, updateSession]);

  // Pure atomic session reducer inside timer callback (`BUG-09`, `BUG-08`, `A11Y-06`)
  useEffect(() => {
    if (
      !venueGroup ||
      isPaused ||
      holdPaused ||
      isDocumentHidden ||
      drawerOpen
    ) {
      return;
    }

    const intervalMs = 50;
    const step = (intervalMs / STORY_DURATION_MS) * 100;

    const timer = window.setInterval(() => {
      setSessionState((prev) => {
        const base =
          prev.key === sessionKey ? prev : buildDefaultSession(sessionKey);
        const curIdx = base.activeEventId
          ? Math.max(
              0,
              events.findIndex((e) => e.id === base.activeEventId)
            )
          : Math.min(base.activeIndex, Math.max(0, events.length - 1));
        const nextProgress = base.progress + step;

        if (nextProgress >= 100) {
          if (curIdx < events.length - 1) {
            const nextIdx = curIdx + 1;
            return {
              ...base,
              activeIndex: nextIdx,
              activeEventId: events[nextIdx]?.id ?? null,
              progress: 0,
            };
          }
          // Stop auto-advancing at the end of the opened venue's flyers (`A11Y-06`)
          return {
            ...base,
            progress: 100,
            isPaused: true,
          };
        }

        return {
          ...base,
          progress: nextProgress,
        };
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [
    venueGroup,
    isPaused,
    holdPaused,
    isDocumentHidden,
    drawerOpen,
    sessionKey,
    buildDefaultSession,
    events,
  ]);

  const handleTogglePause = useCallback(() => {
    updateSession((base) => {
      const nextPaused = !base.isPaused;
      return {
        isPaused: nextPaused,
        progress: !nextPaused && base.progress >= 100 ? 0 : base.progress,
      };
    });
  }, [updateSession]);

  useEffect(() => {
    if (!venueGroup) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === ' ') {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT') return;
        e.preventDefault();
        handleTogglePause();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [venueGroup, goNext, goPrev, handleTogglePause]);

  const sanitizedDescriptionHtml = useMemo(() => {
    if (!currentEvent) return '';
    return sanitizeEventHtml(currentEvent.descriptionHtml);
  }, [currentEvent]);

  if (!venueGroup || !currentEvent) {
    return (
      <dialog
        ref={dialogRef}
        closedby="any"
        aria-label="tarra Event Sticker Flyer"
        className="m-auto bg-transparent p-0 border-0 focus-visible:outline-2 focus-visible:outline-[#ffe600]"
      />
    );
  }

  const resolvedOcc = resolveEventOccurrence(currentEvent, selectedDate, now);
  const effectiveInfoUrl = resolvedOcc.infoUrl ?? currentEvent.infoUrl;
  const scheduleLabel = formatEventTimeLabel(currentEvent, {
    selectedDate,
    now,
    includeEndTime: true,
  });

  const cityMeta = CITIES[currentEvent.cityId];
  const topicMeta =
    TOPICS.find((t) => t.id === currentEvent.category) || TOPICS[0];
  const isSaved =
    savedEventIds.includes(currentEvent.id) ||
    currentEvent.aliasIds.some((id) => savedEventIds.includes(id));

  const safeImageUrl = !imgError
    ? getSafeEventImageUrl(
        currentEvent.raw,
        currentEvent.id,
        currentEvent.aliasIds
      )
    : null;

  const handleShareClick = async () => {
    const res = await onShareDeepLink(currentEvent);
    if (res.ok) {
      setShareFallback(null);
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2600);
    } else {
      setShareFallback({ eventId: currentEvent.id, url: res.url });
    }
  };

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="story-modal-title"
      className="m-auto w-[calc(100vw-24px)] max-w-[410px] h-[min(90dvh,740px)] aspect-[9/16] rounded-2xl bg-[#121418] text-[#f4f1ea] p-0 border-[3.5px] border-[#f4f1ea] shadow-[8px_10px_0px_#07080a,0_0_70px_rgba(0,0,0,0.9)] overflow-hidden focus-visible:outline-2 focus-visible:outline-[#ffe600]"
    >
      {/* Polite live region for screen-reader flyer step announcements (`A11Y-06`) */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {`Flyer ${safeIndex + 1} of ${events.length}: ${currentEvent.title} at ${currentEvent.venueName}`}
      </div>

      <div className="relative w-full h-full flex flex-col justify-between overflow-hidden border-2 border-[#0d0e11]">
        {safeImageUrl ? (
          <img
            src={safeImageUrl}
            alt={currentEvent.imageAlt}
            onError={() => setFailedImgEventId(currentEvent.id)}
            className="absolute inset-0 w-full h-full object-cover contrast-105 scale-[1.01] transition-transform duration-700"
          />
        ) : (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center p-6"
            style={{
              backgroundColor: topicMeta.slapBg,
              color: topicMeta.slapText,
            }}
          >
            <div className="text-[100px] opacity-30 select-none leading-none">
              {currentEvent.categoryEmoji}
            </div>
            <div className="mt-2 px-3 py-1 bg-[#0d0e11] text-[#f4f1ea] font-display-slap text-xs uppercase tracking-widest">
              TARRA // {cityMeta.name}
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0d0e11]/90 via-[#0d0e11]/25 to-[#0d0e11]/95" />

        {/* TOP BAR */}
        <div className="relative z-20 pt-3 px-3.5 flex flex-col gap-2.5">
          {/* Segmented Sticker Tape Progress Bars (`A11Y-05`: role="group" + aria-current="step") */}
          <div
            className="flex items-center gap-1.5"
            role="group"
            aria-label="Venue flyers"
          >
            {events.map((ev, idx) => {
              const barWidth =
                idx < safeIndex ? 100 : idx === safeIndex ? progress : 0;
              return (
                <button
                  key={ev.id}
                  type="button"
                  aria-current={idx === safeIndex ? 'step' : undefined}
                  aria-label={`Flyer ${idx + 1} of ${events.length}: ${ev.title}`}
                  onClick={() =>
                    updateSession(() => ({
                      activeIndex: idx,
                      activeEventId: ev.id,
                      progress: 0,
                    }))
                  }
                  className="flex-1 h-2 bg-white/25 border border-[#0d0e11] overflow-hidden cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
                >
                  <div
                    className="h-full bg-[#ffe600] transition-[width] duration-75"
                    style={{ width: `${barWidth}%` }}
                  />
                </button>
              );
            })}
          </div>

          {/* Venue Street-Sign Slap Header + Controls */}
          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#121418]/95 border-2 border-[#f4f1ea] shadow-[3px_3px_0px_#07080a]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-9 h-9 rounded-md border-2 border-[#0d0e11] flex items-center justify-center text-lg shrink-0 shadow-[2px_2px_0px_#07080a] select-none"
                style={{
                  backgroundColor: topicMeta.slapBg,
                  color: topicMeta.slapText,
                }}
              >
                {currentEvent.categoryEmoji}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-grotesk text-xs font-extrabold uppercase tracking-tight text-[#ffe600] truncate">
                    {currentEvent.venueName}
                  </span>
                  {currentEvent.isLiveNow ? (
                    <span className="px-1.5 py-[1px] bg-[#ff2a85] text-[#0d0e11] border border-[#0d0e11] font-mono-stamp text-[11px] font-bold uppercase tracking-tighter animate-pulse shrink-0">
                      ● LIVE
                    </span>
                  ) : currentEvent.isOngoingLongSpan ? (
                    <span className="px-1.5 py-[1px] bg-[#1a1d24] text-[#ffe600] border border-[#ffe600]/60 font-mono-stamp text-[11px] font-bold uppercase tracking-tighter shrink-0">
                      ON NOW
                    </span>
                  ) : null}
                </div>
                <p className="font-mono-stamp text-[11px] text-[#d5d2c8] truncate flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-[#ffe600] shrink-0" />
                  <span>
                    {currentEvent.distanceKm !== null
                      ? `${formatDistance(currentEvent.distanceKm)} • `
                      : currentEvent.isOnline
                        ? 'Online Event • '
                        : 'Location not provided • '}
                    {cityMeta.name} • {currentEvent.streetAddress}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() =>
                  onToggleSaveEvent(currentEvent.id, currentEvent)
                }
                aria-pressed={isSaved}
                aria-label={
                  isSaved ? 'Remove from saved stash' : 'Save sticker to stash'
                }
                title={isSaved ? 'Saved in Stash' : 'Save to Stash'}
                className={`p-1.5 rounded-md border cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2 ${
                  isSaved
                    ? 'bg-[#ff2a85] text-[#0d0e11] border-[#0d0e11]'
                    : 'bg-[#22262e] hover:bg-[#2e333d] text-[#f4f1ea] border-white/25'
                }`}
              >
                <Bookmark
                  className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`}
                />
              </button>
              <button
                type="button"
                onClick={handleTogglePause}
                aria-pressed={isPaused}
                aria-label={
                  isPaused ? 'Resume flyer timer' : 'Pause flyer timer'
                }
                title={isPaused ? 'Auto-advance paused' : 'Pause auto-advance'}
                className="p-1.5 rounded-md bg-[#22262e] hover:bg-[#2e333d] text-[#f4f1ea] border border-white/25 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
              >
                {isPaused ? (
                  <Play className="w-4 h-4" />
                ) : (
                  <Pause className="w-4 h-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (dialogRef.current) {
                    void closeTopLayer(dialogRef.current);
                  }
                }}
                aria-label="Close flyer viewer"
                className="p-1.5 rounded-md bg-[#ffe600] hover:bg-[#fff04d] text-[#0d0e11] border border-[#0d0e11] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f4f1ea] focus-visible:outline-offset-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mandatory Photographer & Source Attribution Stamp */}
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-[#121418]/90 border border-[#f4f1ea]/40 font-mono-stamp text-[11px] text-[#f4f1ea] max-w-full truncate shadow"
              title={currentEvent.attribution.badgeText}
            >
              <span className="truncate">
                {currentEvent.attribution.badgeText}
              </span>
            </div>
            <span className="px-2 py-0.5 rounded-sm bg-[#ffe600] text-[#0d0e11] border border-[#0d0e11] font-mono-stamp text-[11px] font-bold uppercase tracking-tighter">
              {currentEvent.attribution.licenseType === 'cc_by'
                ? 'CC BY 4.0'
                : 'EVENT-ONLY'}
            </span>
          </div>
        </div>

        {/* MIDDLE TAP ZONES (`BUG-08`: holdPaused never clobbers manual isPaused) */}
        <div className="relative z-10 flex-1 grid grid-cols-3 items-center">
          <button
            type="button"
            aria-label="Previous flyer"
            onClick={goPrev}
            className="h-full w-full flex items-center justify-start pl-2 opacity-0 hover:opacity-100 focus:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-[-4px]"
          >
            <span className="p-1.5 rounded-md bg-[#121418]/90 border-2 border-[#f4f1ea] text-[#f4f1ea] shadow-[2px_2px_0px_#07080a]">
              <ChevronLeft className="w-5 h-5" />
            </span>
          </button>
          <div
            onPointerDown={() => updateSession(() => ({ holdPaused: true }))}
            onPointerUp={() => updateSession(() => ({ holdPaused: false }))}
            onPointerLeave={() => updateSession(() => ({ holdPaused: false }))}
            onPointerCancel={() => updateSession(() => ({ holdPaused: false }))}
            onTouchEnd={() => updateSession(() => ({ holdPaused: false }))}
            onTouchCancel={() => updateSession(() => ({ holdPaused: false }))}
            className="h-full w-full"
          />
          <button
            type="button"
            aria-label="Next flyer"
            onClick={goNext}
            className="h-full w-full flex items-center justify-end pr-2 opacity-0 hover:opacity-100 focus:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-[-4px]"
          >
            <span className="p-1.5 rounded-md bg-[#121418]/90 border-2 border-[#f4f1ea] text-[#f4f1ea] shadow-[2px_2px_0px_#07080a]">
              <ChevronRight className="w-5 h-5" />
            </span>
          </button>
        </div>

        {/* BOTTOM FLYER POSTER BLOCK & ACTIONS */}
        <div className="relative z-20 px-4 pb-4 pt-2 flex flex-col gap-2.5">
          {/* Category, Price & Calendar Export Slaps */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-sm border border-[#0d0e11] shadow-[2px_2px_0px_#07080a] font-grotesk text-xs font-extrabold uppercase tracking-tight"
              style={{
                backgroundColor: topicMeta.slapBg,
                color: topicMeta.slapText,
              }}
            >
              <span>{currentEvent.categoryEmoji}</span>
              <span>{currentEvent.categoryLabel}</span>
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-sm border shadow-[2px_2px_0px_#07080a] font-mono-stamp text-xs font-bold uppercase ${
                currentEvent.priceStatus === 'free'
                  ? 'bg-[#22c55e] text-[#0d0e11] border-[#0d0e11]'
                  : currentEvent.priceStatus === 'paid'
                    ? 'bg-[#ffe600] text-[#0d0e11] border-[#0d0e11]'
                    : 'bg-[#22262e] text-[#d5d2c8] border-white/25'
              }`}
            >
              <Ticket className="w-3.5 h-3.5" />
              <span>{currentEvent.priceText}</span>
            </span>
            <button
              type="button"
              onClick={() => downloadEventIcs(currentEvent, selectedDate)}
              title="Add event to Apple / Outlook / Mobile Calendar (.ics)"
              className="ml-auto inline-flex items-center gap-1 px-2.5 py-0.5 rounded-sm bg-[#121418] hover:bg-[#22262e] border border-[#f4f1ea] font-mono-stamp text-[11px] font-bold text-[#ffe600] cursor-pointer shadow-[2px_2px_0px_#07080a] focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
            >
              <CalendarPlus className="w-3 h-3 text-[#ffe600]" />
              <span>+ .ICS</span>
            </button>
          </div>

          {/* Event Title & Short Summary Sticker Block */}
          <div className="p-3 rounded-lg bg-[#121418]/92 border-2 border-[#f4f1ea] shadow-[4px_4px_0px_#07080a]">
            <h2
              id="story-modal-title"
              className="text-lg sm:text-xl font-extrabold tracking-tight text-[#f4f1ea] leading-snug"
            >
              {currentEvent.title}
            </h2>
            <p className="mt-1 font-mono-stamp text-xs text-[#ffe600] font-bold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>{scheduleLabel}</span>
            </p>
            <p className="mt-1.5 text-xs text-[#d5d2c8] line-clamp-2 leading-relaxed">
              {currentEvent.shortDescription}
            </p>
          </div>

          {/* Primary Organic Slap Action Bar */}
          <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
            <button
              type="button"
              aria-expanded={drawerOpen}
              onClick={() => updateSession(() => ({ drawerOpen: true }))}
              style={
                {
                  '--slap-rot': '-1.6deg',
                  '--slap-radius': '10px 4px 12px 5px',
                } as React.CSSProperties
              }
              className="organic-slap-btn flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[#f4f1ea] hover:bg-white text-[#0d0e11] border-2 border-[#0d0e11] font-grotesk font-extrabold text-xs uppercase tracking-tight cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
            >
              <Info aria-hidden="true" className="w-3.5 h-3.5" />
              <span>Details</span>
            </button>

            {onShowOnMap &&
              currentEvent.hasExactCoordinates &&
              currentEvent.coordinates && (
                <button
                  type="button"
                  onClick={() => {
                    onShowOnMap(currentEvent);
                    if (dialogRef.current) {
                      void closeTopLayer(dialogRef.current);
                    }
                  }}
                  style={
                    {
                      '--slap-rot': '1.8deg',
                      '--slap-radius': '5px 12px 4px 10px',
                    } as React.CSSProperties
                  }
                  className="organic-slap-btn flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[#ff2a85] hover:bg-[#ff4796] text-[#0d0e11] border-2 border-[#0d0e11] font-grotesk font-extrabold text-xs uppercase tracking-tight cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
                >
                  <MapIcon aria-hidden="true" className="w-3.5 h-3.5" />
                  <span>On Map</span>
                </button>
              )}

            {currentEvent.reittiopasUrl && (
              <a
                href={currentEvent.reittiopasUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={
                  {
                    '--slap-rot': '-1.2deg',
                    '--slap-radius': '11px 5px 9px 4px',
                  } as React.CSSProperties
                }
                className="organic-slap-btn flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[#ffe600] hover:bg-[#fff04d] text-[#0d0e11] border-2 border-[#0d0e11] font-grotesk font-extrabold text-xs uppercase tracking-tight focus-visible:outline-2 focus-visible:outline-[#f4f1ea] focus-visible:outline-offset-2"
              >
                <Navigation aria-hidden="true" className="w-3.5 h-3.5" />
                <span>Route</span>
              </a>
            )}

            <button
              type="button"
              onClick={handleShareClick}
              aria-label="Copy deep link to this event"
              style={
                {
                  '--slap-rot': '2.5deg',
                  '--slap-radius': '50%',
                } as React.CSSProperties
              }
              className="organic-slap-btn w-9 h-9 shrink-0 inline-flex items-center justify-center bg-[#22262e] hover:bg-[#2e333d] border-2 border-[#f4f1ea] text-[#f4f1ea] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
            >
              {copiedToast ? (
                <Check aria-hidden="true" className="w-4 h-4 text-[#22c55e]" />
              ) : (
                <Share2 aria-hidden="true" className="w-4 h-4" />
              )}
            </button>
          </div>

          {copiedToast && (
            <div className="px-3 py-1.5 rounded-md bg-[#22c55e] text-[#0d0e11] border-2 border-[#0d0e11] font-mono-stamp text-[11px] font-bold text-center animate-fade-in">
              ✓ Event link copied to clipboard
            </div>
          )}

          {shareFallbackUrl && (
            <div className="p-2 rounded-md bg-[#1a1d24] border border-[#ffe600] flex items-center gap-1.5 animate-fade-in">
              <input
                type="text"
                readOnly
                value={shareFallbackUrl}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Shareable event URL"
                className="flex-1 bg-transparent font-mono-stamp text-[11px] text-[#f4f1ea] focus-visible:outline-2 focus-visible:outline-[#ffe600] rounded-xs"
              />
              <button
                type="button"
                onClick={() => setShareFallback(null)}
                aria-label="Dismiss share URL"
                className="text-[#c7c4b8] hover:text-white cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* API / Calendar Source Attribution Footer */}
          <div className="flex items-center justify-between font-mono-stamp text-[11px] text-[#c7c4b8] pt-0.5 border-t border-white/15">
            <span className="truncate">
              {currentEvent.attribution.apiAttributionText}
            </span>
            <a
              href={currentEvent.attribution.apiLicenseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[#ffe600] shrink-0 ml-2 font-bold focus-visible:outline-2 focus-visible:outline-[#ffe600]"
            >
              {currentEvent.attribution.apiLicenseUrl === CC_BY_4_URL
                ? 'CC BY 4.0'
                : 'Source Terms'}
            </a>
          </div>
        </div>

        {/* Sanitized HTML Flyer Backside Drawer (`SEC-02`, `UI-02`, `BUG-01`) */}
        {drawerOpen && (
          <div className="absolute inset-0 z-30 bg-[#121418] flex flex-col p-5 animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b-2 border-[#f4f1ea]/20">
              <div className="flex items-center gap-2 min-w-0">
                <span className="px-2 py-0.5 bg-[#ffe600] text-[#0d0e11] font-mono-stamp text-[11px] font-bold uppercase shrink-0">
                  INFO
                </span>
                <h3 className="text-sm font-bold text-[#f4f1ea] truncate">
                  {currentEvent.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => updateSession(() => ({ drawerOpen: false }))}
                className="p-1.5 rounded-md bg-[#ffe600] text-[#0d0e11] border border-[#0d0e11] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f4f1ea] focus-visible:outline-offset-2"
                aria-label="Close details drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              <div className="p-3 rounded-lg bg-[#1a1d24] border-2 border-[#f4f1ea]/30 space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-[#ffe600] font-mono-stamp font-bold">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  <span>{scheduleLabel}</span>
                </div>
                <div className="flex items-center gap-2 text-[#f4f1ea]">
                  <MapPin className="w-3.5 h-3.5 text-[#ff2a85] shrink-0" />
                  <span>
                    {currentEvent.venueName} — {currentEvent.streetAddress}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[#c7c4b8] font-mono-stamp text-[11px]">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#22c55e] shrink-0" />
                  <span>{currentEvent.attribution.badgeText}</span>
                </div>
              </div>

              {/* Add to Calendar Options (`DATA-04`) */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadEventIcs(currentEvent, selectedDate)}
                  className="flex-1 py-2 px-3 rounded-md bg-[#22262e] hover:bg-[#2e333d] border border-[#f4f1ea]/30 font-mono-stamp text-xs font-bold text-[#f4f1ea] inline-flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
                >
                  <CalendarPlus className="w-3.5 h-3.5 text-[#ffe600]" />
                  <span>Download .ICS</span>
                </button>
                <a
                  href={buildGoogleCalendarUrl(currentEvent, selectedDate)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 px-3 rounded-md bg-[#22262e] hover:bg-[#2e333d] border border-[#f4f1ea]/30 font-mono-stamp text-xs font-bold text-[#f4f1ea] inline-flex items-center justify-center gap-1.5 focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
                >
                  <Calendar className="w-3.5 h-3.5 text-[#ff5500]" />
                  <span>Google Calendar</span>
                </a>
              </div>

              <div
                className="event-description-copy max-w-none text-[#e5e2d8] text-xs leading-relaxed"
                dangerouslySetInnerHTML={{ __html: sanitizedDescriptionHtml }}
              />
            </div>

            <div className="pt-3 border-t-2 border-dashed border-[#f4f1ea]/20 flex items-center gap-2">
              {currentEvent.reittiopasUrl && (
                <a
                  href={currentEvent.reittiopasUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-[#ffe600] hover:bg-[#fff04d] text-[#0d0e11] border-2 border-[#0d0e11] shadow-[2px_2px_0px_#07080a] font-grotesk font-extrabold text-xs uppercase focus-visible:outline-2 focus-visible:outline-[#f4f1ea] focus-visible:outline-offset-2"
                >
                  <Navigation className="w-4 h-4" />
                  <span>Transit Route (Digitransit)</span>
                </a>
              )}
              {effectiveInfoUrl && (
                <a
                  href={effectiveInfoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-[#22262e] hover:bg-[#2e333d] border border-[#f4f1ea] text-[#f4f1ea] font-grotesk font-bold text-xs uppercase focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
                >
                  <span>Official Page</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
};
