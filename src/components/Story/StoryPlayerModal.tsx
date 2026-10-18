import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import DOMPurify from 'dompurify';
import {
  Bookmark,
  Calendar,
  CalendarPlus,
  Clock,
  ExternalLink,
  Info,
  MapPin,
  Navigation,
  Pause,
  Play,
  Share2,
  ShieldCheck,
  Sparkles,
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
} from '../../utils/calendarUtils';
import { formatDistance } from '../../utils/distanceUtils';
import { getSafeEventImageUrl } from '../../utils/licenseGuard';

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
  getComputedStyle(probe).display;
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

interface StoryPlayerModalProps {
  venueGroup: VenueStoryGroup | null;
  initialEventId?: string | null;
  savedEventIds: string[];
  onToggleSaveEvent: (eventId: string) => void;
  onClose: () => void;
  onActiveEventChange: (eventId: string) => void;
  onShareDeepLink: (event: NormalizedEvent) => Promise<boolean>;
  onNextVenue?: () => void;
  onPrevVenue?: () => void;
}

const STORY_DURATION_MS = 8000;

export const StoryPlayerModal: React.FC<StoryPlayerModalProps> = ({
  venueGroup,
  initialEventId,
  savedEventIds,
  onToggleSaveEvent,
  onClose,
  onActiveEventChange,
  onShareDeepLink,
  onNextVenue,
  onPrevVenue,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [imgError, setImgError] = useState(false);

  const events = venueGroup?.events || [];
  const currentEvent: NormalizedEvent | undefined =
    events[activeIndex] || events[0];

  useEffect(() => {
    if (!venueGroup) return;
    if (initialEventId) {
      const idx = venueGroup.events.findIndex((e) => e.id === initialEventId);
      setActiveIndex(idx >= 0 ? idx : 0);
    } else {
      setActiveIndex(0);
    }
    setProgress(0);
    setDrawerOpen(false);
    setImgError(false);
  }, [venueGroup, initialEventId]);

  useEffect(() => {
    if (currentEvent) {
      onActiveEventChange(currentEvent.id);
      setImgError(false);
    }
  }, [currentEvent, onActiveEventChange]);

  // Open/close native <dialog> using showModal() and register light-dismiss + exit animation fallbacks
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (venueGroup) {
      dialog.removeAttribute('data-closing');
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      void closeTopLayer(dialog);
    }

    const handleNativeClose = () => {
      onClose();
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
  }, [venueGroup, onClose]);

  const goNext = useCallback(() => {
    if (!venueGroup) return;
    if (activeIndex < venueGroup.events.length - 1) {
      setActiveIndex((i) => i + 1);
      setProgress(0);
      setDrawerOpen(false);
    } else if (onNextVenue) {
      onNextVenue();
    } else if (dialogRef.current) {
      void closeTopLayer(dialogRef.current);
    }
  }, [activeIndex, venueGroup, onNextVenue]);

  const goPrev = useCallback(() => {
    if (!venueGroup) return;
    if (activeIndex > 0) {
      setActiveIndex((i) => i - 1);
      setProgress(0);
      setDrawerOpen(false);
    } else if (onPrevVenue) {
      onPrevVenue();
    } else {
      setProgress(0);
    }
  }, [activeIndex, venueGroup, onPrevVenue]);

  useEffect(() => {
    if (!venueGroup || isPaused || drawerOpen) return;

    const intervalMs = 50;
    const step = (intervalMs / STORY_DURATION_MS) * 100;

    const timer = window.setInterval(() => {
      setProgress((prev) => {
        if (prev + step >= 100) {
          goNext();
          return 0;
        }
        return prev + step;
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [venueGroup, isPaused, drawerOpen, goNext]);

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
        e.preventDefault();
        setIsPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [venueGroup, goNext, goPrev]);

  const sanitizedDescriptionHtml = useMemo(() => {
    if (!currentEvent) return '';
    return DOMPurify.sanitize(currentEvent.descriptionHtml, {
      USE_PROFILES: { html: true },
    });
  }, [currentEvent]);

  if (!venueGroup || !currentEvent) {
    return (
      <dialog
        ref={dialogRef}
        closedby="any"
        aria-label="Snap Story Player"
        className="m-auto bg-transparent p-0 border-0 outline-none"
      />
    );
  }

  const cityMeta = CITIES[currentEvent.cityId];
  const topicMeta =
    TOPICS.find((t) => t.id === currentEvent.category) || TOPICS[0];
  const isSaved = savedEventIds.includes(currentEvent.id);

  const safeImageUrl = !imgError
    ? getSafeEventImageUrl(currentEvent.raw, currentEvent.id)
    : null;

  const formatTimeWindow = (start: Date, end: Date) => {
    const timeFmt = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const dateFmt = new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    return `${dateFmt.format(start)} • ${timeFmt.format(start)}–${timeFmt.format(end)}`;
  };

  const handleShareClick = async () => {
    const ok = await onShareDeepLink(currentEvent);
    if (ok) {
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2600);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="story-modal-title"
      className="m-auto w-full max-w-[410px] h-[min(92dvh,750px)] aspect-[9/16] rounded-3xl bg-slate-950 text-white p-0 border border-white/15 shadow-[0_0_70px_rgba(0,0,0,0.9)] overflow-hidden outline-none"
    >
      <div className="relative w-full h-full flex flex-col justify-between select-none overflow-hidden">
        {safeImageUrl ? (
          <img
            src={safeImageUrl}
            alt={currentEvent.imageAlt}
            onError={() => setImgError(true)}
            className="absolute inset-0 w-full h-full object-cover scale-[1.02] transition-transform duration-700"
          />
        ) : (
          <div
            className={`absolute inset-0 bg-gradient-to-br ${topicMeta.ringGradient} opacity-90 flex items-center justify-center`}
          >
            <div className="text-[110px] opacity-25 select-none filter blur-[1px]">
              {currentEvent.categoryEmoji}
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/85 via-slate-950/25 to-slate-950/95" />

        {/* TOP BAR */}
        <div className="relative z-20 pt-3 px-3.5 flex flex-col gap-2.5">
          {/* Segmented Story Progress Bars */}
          <div
            className="flex items-center gap-1.5"
            role="tablist"
            aria-label="Venue stories"
          >
            {events.map((ev, idx) => {
              const barWidth =
                idx < activeIndex ? 100 : idx === activeIndex ? progress : 0;
              return (
                <button
                  key={ev.id}
                  type="button"
                  role="tab"
                  aria-selected={idx === activeIndex}
                  aria-label={`Story ${idx + 1}: ${ev.title}`}
                  onClick={() => {
                    setActiveIndex(idx);
                    setProgress(0);
                  }}
                  className="flex-1 h-1.5 rounded-full bg-white/25 overflow-hidden cursor-pointer focus:outline-none"
                >
                  <div
                    className="h-full bg-gradient-to-r from-cyan-400 via-white to-fuchsia-400 transition-[width] duration-75"
                    style={{ width: `${barWidth}%` }}
                  />
                </button>
              );
            })}
          </div>

          {/* Venue Header + Controls */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative w-10 h-10 rounded-full p-[2px] bg-gradient-to-tr from-cyan-400 via-fuchsia-500 to-amber-400 shrink-0">
                <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center text-lg">
                  {currentEvent.categoryEmoji}
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white truncate">
                    {currentEvent.venueName}
                  </span>
                  {currentEvent.isLiveNow && (
                    <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-[9px] font-black uppercase tracking-wider text-white animate-pulse">
                      LIVE NOW
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-300 truncate flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-cyan-400 shrink-0" />
                  <span>
                    {formatDistance(currentEvent.distanceKm)} • {cityMeta.name} •{' '}
                    {currentEvent.streetAddress}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onToggleSaveEvent(currentEvent.id)}
                aria-label={
                  isSaved ? 'Remove from saved lineup' : 'Save event to lineup'
                }
                title={isSaved ? 'Saved in Lineup' : 'Save to Lineup'}
                className={`p-2 rounded-full border backdrop-blur-md cursor-pointer transition-colors ${
                  isSaved
                    ? 'bg-fuchsia-500 text-white border-fuchsia-300'
                    : 'bg-slate-900/70 hover:bg-slate-800 text-white border-white/15'
                }`}
              >
                <Bookmark
                  className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`}
                />
              </button>
              <button
                type="button"
                onClick={() => setIsPaused((p) => !p)}
                aria-label={
                  isPaused ? 'Resume story timer' : 'Pause story timer'
                }
                className="p-2 rounded-full bg-slate-900/70 hover:bg-slate-800 text-white border border-white/15 backdrop-blur-md cursor-pointer"
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
                aria-label="Close story viewer"
                className="p-2 rounded-full bg-slate-900/70 hover:bg-slate-800 text-white border border-white/15 backdrop-blur-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mandatory Photographer & Source Attribution Pill */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5">
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950/75 border border-white/15 backdrop-blur-md text-[10px] text-slate-200 max-w-full truncate"
              title={currentEvent.attribution.badgeText}
            >
              <span className="truncate font-medium">
                {currentEvent.attribution.badgeText}
              </span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-[9px] font-semibold uppercase tracking-wider text-cyan-200">
              {currentEvent.attribution.licenseType === 'cc_by'
                ? 'CC BY 4.0'
                : 'Event-Only Media'}
            </span>
          </div>
        </div>

        {/* MIDDLE TAP ZONES */}
        <div className="relative z-10 flex-1 grid grid-cols-3 items-center">
          <button
            type="button"
            aria-label="Previous story"
            onClick={goPrev}
            className="h-full w-full flex items-center justify-start pl-2 opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer focus:outline-none"
          >
            <span className="p-1.5 rounded-full bg-slate-950/60 border border-white/15 text-white">
              <ChevronLeft className="w-5 h-5" />
            </span>
          </button>
          <div
            onMouseDown={() => setIsPaused(true)}
            onMouseUp={() => setIsPaused(false)}
            onTouchStart={() => setIsPaused(true)}
            onTouchEnd={() => setIsPaused(false)}
            className="h-full w-full"
          />
          <button
            type="button"
            aria-label="Next story"
            onClick={goNext}
            className="h-full w-full flex items-center justify-end pr-2 opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer focus:outline-none"
          >
            <span className="p-1.5 rounded-full bg-slate-950/60 border border-white/15 text-white">
              <ChevronRight className="w-5 h-5" />
            </span>
          </button>
        </div>

        {/* BOTTOM STORY CONTENT & ACTIONS */}
        <div className="relative z-20 px-4 pb-4 pt-2 flex flex-col gap-2.5">
          {/* Category, Price & Calendar Export Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-semibold text-white">
              <span>{currentEvent.categoryEmoji}</span>
              <span>{currentEvent.categoryLabel}</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 backdrop-blur-md text-xs font-bold text-emerald-200">
              <Ticket className="w-3.5 h-3.5" />
              <span>{currentEvent.priceText}</span>
            </span>
            <button
              type="button"
              onClick={() => downloadEventIcs(currentEvent)}
              title="Add event to Apple / Outlook / Mobile Calendar (.ics)"
              className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-900/85 hover:bg-slate-800 border border-cyan-400/40 text-[11px] font-bold text-cyan-200 cursor-pointer"
            >
              <CalendarPlus className="w-3 h-3 text-cyan-400" />
              <span>+ Calendar</span>
            </button>
          </div>

          {/* Event Title & Short Summary */}
          <div>
            <h2
              id="story-modal-title"
              className="text-xl font-extrabold tracking-tight text-white leading-snug drop-shadow-md"
            >
              {currentEvent.title}
            </h2>
            <p className="mt-1 text-xs text-cyan-200 font-medium flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>
                {formatTimeWindow(currentEvent.startTime, currentEvent.endTime)}
              </span>
            </p>
            <p className="mt-1.5 text-xs text-slate-200 line-clamp-2 leading-relaxed">
              {currentEvent.shortDescription}
            </p>
          </div>

          {/* Primary Action Bar */}
          <div className="grid grid-cols-12 gap-2 pt-1">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="col-span-5 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-2xl bg-white text-slate-950 font-bold text-xs shadow-lg hover:bg-cyan-300 transition-colors cursor-pointer"
            >
              <Info className="w-4 h-4" />
              <span>Read More</span>
            </button>

            <a
              href={currentEvent.reittiopasUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="col-span-5 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-xs shadow-lg hover:from-cyan-400 hover:to-blue-500 transition-all"
            >
              <Navigation className="w-4 h-4" />
              <span>Reittiopas</span>
            </a>

            <button
              type="button"
              onClick={handleShareClick}
              aria-label="Copy deep link to this event"
              title="Copy shareable URL (?city=...&event=...)"
              className="col-span-2 inline-flex items-center justify-center rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-white/20 text-white transition-colors cursor-pointer"
            >
              {copiedToast ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Share2 className="w-4 h-4" />
              )}
            </button>
          </div>

          {copiedToast && (
            <div className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 text-[11px] font-semibold text-center animate-fade-in">
              ✓ Deep link copied! (?city={currentEvent.cityId}&event=
              {currentEvent.id})
            </div>
          )}

          {/* CC BY 4.0 API Attribution Footer */}
          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5 border-t border-white/10">
            <span className="truncate">
              {currentEvent.attribution.apiAttributionText}
            </span>
            <a
              href={currentEvent.attribution.apiLicenseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-cyan-300 shrink-0 ml-2"
            >
              CC BY 4.0
            </a>
          </div>
        </div>

        {/* DOMPurify Sanitized HTML Description Drawer */}
        {drawerOpen && (
          <div className="absolute inset-0 z-30 bg-slate-950/95 backdrop-blur-xl flex flex-col p-5 animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
                <h3 className="text-sm font-bold text-white truncate">
                  {currentEvent.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                aria-label="Close details drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              <div className="p-3 rounded-2xl bg-slate-900/90 border border-white/10 space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-cyan-300 font-semibold">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>
                    {formatTimeWindow(
                      currentEvent.startTime,
                      currentEvent.endTime
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-200">
                  <MapPin className="w-3.5 h-3.5 text-fuchsia-400" />
                  <span>
                    {currentEvent.venueName} — {currentEvent.streetAddress}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{currentEvent.attribution.badgeText}</span>
                </div>
              </div>

              {/* Add to Calendar Options */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadEventIcs(currentEvent)}
                  className="flex-1 py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <CalendarPlus className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Download .ICS</span>
                </button>
                <a
                  href={buildGoogleCalendarUrl(currentEvent)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5"
                >
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  <span>Google Calendar</span>
                </a>
              </div>

              <div
                className="prose prose-invert prose-sm max-w-none text-slate-200 text-xs leading-relaxed space-y-2"
                dangerouslySetInnerHTML={{ __html: sanitizedDescriptionHtml }}
              />
            </div>

            <div className="pt-3 border-t border-white/10 flex items-center gap-2">
              <a
                href={currentEvent.reittiopasUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
              >
                <Navigation className="w-4 h-4" />
                <span>Transit Route (Digitransit)</span>
              </a>
              {currentEvent.infoUrl && (
                <a
                  href={currentEvent.infoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs"
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
