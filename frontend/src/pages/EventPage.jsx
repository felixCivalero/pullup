// frontend/src/pages/EventPage.jsx
// Mobile-first, Instagram-friendly event page
import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { PartyPopper } from "lucide-react";
import {
  FaInstagram,
  FaSpotify,
  FaTiktok,
  FaSoundcloud,
  FaCalendar,
  FaMapMarkerAlt,
} from "react-icons/fa";
import { SilverIcon } from "../components/ui/SilverIcon.jsx";
import { MediaCarousel, CarouselDots, useCarouselSwipe } from "../components/MediaCarousel";
import { useToast } from "../components/Toast";
import {
  getEventShareUrl,
  getGoogleMapsUrl,
  formatLocationShort,
} from "../lib/urlUtils";
import { formatEventDate, formatEventTime } from "../lib/dateUtils.js";
import { hasEventEnded } from "../lib/eventLifecycle.js";
import { ModalOrDrawer } from "../components/ui/ModalOrDrawer";
import { EventPageContent } from "../components/EventPageContent";
import { EventPreview } from "../components/EventPreview";
import { DesktopEventLayout } from "../components/DesktopEventLayout";
import { RsvpForm } from "../components/RsvpForm";
import { lazy, Suspense } from "react";
import { transformedImageUrl } from "../lib/imageUtils.js";
// Stripe Elements ride their own chunk — fetched only if a paid flow renders
// (paid tickets are paused, so in practice: never).
const LazyPaymentForm = lazy(() => import("../components/PaymentForm").then((m) => ({ default: m.PaymentForm })));
function PaymentForm(props) {
  return (
    <Suspense fallback={null}>
      <LazyPaymentForm {...props} />
    </Suspense>
  );
}
import { Button } from "../components/ui/Button";
import { EventCTA, getCtaLabel, EVENT_CTA_HEIGHT } from "../components/EventCTA";
import { Badge } from "../components/ui/Badge";
import { publicFetch } from "../lib/api.js";
import { isNetworkError, handleNetworkError } from "../lib/errorHandler.js";
import { logger } from "../lib/logger.js";
import { colors } from "../theme/colors.js";

// Loading state for the guest event page — a shimmering skeleton of the real
// layout (full-bleed hero → title/meta → body → sticky CTA) instead of a bare
// "Loading event…". Dark, to match the guest page.
function EventPageSkeleton() {
  const block = (style) => (
    <div style={{ borderRadius: 8, background: "rgba(255,255,255,0.05)", backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0) 100%)", backgroundSize: "240px 100%", backgroundRepeat: "no-repeat", animation: "pp-shimmer 1.4s ease-in-out infinite", ...style }} />
  );
  return (
    <div style={{ minHeight: "100dvh", background: "#0b0a12", display: "flex", justifyContent: "center" }}>
      <style>{`@keyframes pp-shimmer { 0% { background-position: -240px 0; } 100% { background-position: calc(100% + 240px) 0; } }`}</style>
      <div style={{ width: "100%", maxWidth: 460, minHeight: "100dvh", position: "relative", display: "flex", flexDirection: "column" }}>
        {/* Hero */}
        <div style={{ position: "relative", height: "56vh", minHeight: 320, background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
          {block({ position: "absolute", inset: 0, borderRadius: 0 })}
          {/* Title sitting low on the hero, like the real page. */}
          <div style={{ position: "absolute", left: 22, right: 22, bottom: 26, display: "flex", flexDirection: "column", gap: 10 }}>
            {block({ height: 30, width: "82%", background: "rgba(255,255,255,0.10)" })}
            {block({ height: 16, width: "55%", background: "rgba(255,255,255,0.08)" })}
          </div>
        </div>
        {/* Body */}
        <div style={{ padding: "24px 22px", display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {block({ height: 14, width: "40%" })}
            {block({ height: 14, width: "62%" })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {block({ height: 12, width: "100%" })}
            {block({ height: 12, width: "92%" })}
            {block({ height: 12, width: "78%" })}
          </div>
        </div>
        {/* Sticky CTA */}
        <div style={{ marginTop: "auto", padding: "16px 22px calc(20px + env(safe-area-inset-bottom))" }}>
          {block({ height: 54, width: "100%", borderRadius: 999, background: "rgba(236,23,143,0.18)" })}
        </div>
      </div>
    </div>
  );
}

export function EventPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();

  const [event, setEvent] = useState(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [showRsvpForm, setShowRsvpForm] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [pendingPayment, setPendingPayment] = useState(null); // { clientSecret, amount, currency, booking }
  const [currentPartySize, setCurrentPartySize] = useState(1); // Track party size for price calculation
  const [waitlistOffer, setWaitlistOffer] = useState(null); // Waitlist payment link offer
  const [waitlistToken, setWaitlistToken] = useState(null); // Waitlist token from URL
  const [vipOffer, setVipOffer] = useState(null); // VIP invite offer
  const [vipToken, setVipToken] = useState(null); // VIP token from URL
  const [canShareStory, setCanShareStory] = useState(false);
  const [showSharePicker, setShowSharePicker] = useState(false);
  const [selectedShareIndexes, setSelectedShareIndexes] = useState(new Set());

  // Viewport-gated layout: ≥1024px gets the new desktop one-pager, < 1024 keeps
  // the existing mobile full-screen EventPreview.
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 1024 : false,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // MUST be called before any early returns to follow Rules of Hooks
  const swipeHandlers = useCarouselSwipe(
    event?.media?.length || 0,
    setCarouselIndex,
  );

  // Memoize the payment success handler to prevent PaymentForm remounts
  // MUST be called before any early returns to follow Rules of Hooks
  const handlePaymentSuccess = useCallback(
    async (paymentIntent) => {
      // Stripe confirmed the PaymentIntent on the client.
      const currentPayment = pendingPayment;
      const currentEvent = event; // Capture event at callback time

      // Basic safety fallback if state was lost
      if (!currentPayment || !currentEvent) {
        if (currentEvent?.slug) {
          navigate(`/e/${currentEvent.slug}/success`, {
            state: {
              booking: {
                name:
                  paymentIntent?.charges?.data?.[0]?.billing_details?.name ||
                  null,
                email: null,
              },
              payment: {
                id: paymentIntent.id,
                status: paymentIntent.status || "succeeded",
              },
            },
          });
        }
        return;
      }

      // Standard PaymentIntent flow (Option B):
      // - Client confirms PaymentIntent with Stripe.js
      // - If Stripe returns succeeded, redirect immediately
      // - Backend/webhook later fulfills based on payment_intent.succeeded
      // - FALLBACK: If webhook doesn't arrive, manually verify payment
      if (paymentIntent?.status === "succeeded") {
        // Fallback: Manually verify payment with backend
        // This ensures payment status updates even if webhook doesn't arrive
        try {
          console.log(
            "[EventPage] Payment succeeded, verifying with backend..."
          );
          const verifyRes = await publicFetch(
            `/payments/verify/${paymentIntent.id}`,
            {
              method: "POST",
            }
          );
          if (verifyRes.ok) {
            const verifyData = await verifyRes.json();
            console.log("[EventPage] Payment verified:", verifyData);
          } else {
            console.warn(
              "[EventPage] Payment verification failed, but payment succeeded client-side"
            );
          }
        } catch (verifyError) {
          console.error("[EventPage] Error verifying payment:", verifyError);
          // Don't block user flow - payment succeeded client-side
        }

        setPendingPayment(null);
        setShowRsvpForm(false);
        // Extract booking data from nested structure for paid events
        const rsvpData = currentPayment.booking?.rsvp || {};
        const statusDetails = currentPayment.booking?.statusDetails || {};
        const eventData = currentPayment.booking?.event || currentEvent;

        // Extract dinner info from multiple possible locations
        // Backend returns it in statusDetails, but also in rsvp.dinner
        const dinnerBookingStatus =
          statusDetails?.dinnerBookingStatus ||
          rsvpData?.dinner?.bookingStatus ||
          rsvpData?.dinnerBookingStatus ||
          null;
        const wantsDinner =
          statusDetails?.wantsDinner !== undefined
            ? statusDetails.wantsDinner
            : rsvpData?.dinner?.enabled || rsvpData?.wantsDinner || false;

        // A product purchase lands on its delivery, not the event success page.
        if (currentEvent.kind === "product") {
          const rsvpId = rsvpData?.id;
          navigate(`/p/${currentEvent.slug}${rsvpId ? `?purchase=${rsvpId}` : ""}`);
          return;
        }

        navigate(`/e/${currentEvent.slug}/success`, {
          state: {
            booking: {
              name: currentPayment.booking?.name || rsvpData?.name || null,
              email: currentPayment.booking?.email || rsvpData?.email || null,
              bookingStatus:
                // Payment succeeded → always CONFIRMED regardless of initial PENDING_PAYMENT status
                "CONFIRMED",
              dinnerBookingStatus: wantsDinner ? "CONFIRMED" : dinnerBookingStatus,
              wantsDinner: wantsDinner,
              partySize:
                rsvpData?.partySize || currentPayment.booking?.partySize || 1,
              plusOnes: rsvpData?.plusOnes || 0,
              dinnerPartySize:
                rsvpData?.dinnerPartySize ||
                rsvpData?.dinner?.partySize ||
                null,
              dinnerTimeSlot:
                rsvpData?.dinnerTimeSlot || rsvpData?.dinner?.slotTime || null,
            },
            payment: {
              id: currentPayment.paymentId,
              status: "succeeded",
              amount: currentPayment.amount,
              currency: currentPayment.currency,
              paymentBreakdown: currentPayment.paymentBreakdown,
            },
          },
        });
      } else {
        console.warn(
          "[EventPage] PaymentIntent not succeeded after confirm:",
          paymentIntent?.status
        );
      }
    },
    [event, navigate, pendingPayment]
  );

  // Payments v2: a settled rail charge (M-Pesa / Swish / mock) — the webhook
  // confirmed the booking server-side; navigate exactly like the Stripe path.
  const handleV2Success = useCallback(
    (settled) => {
      const currentPayment = pendingPayment;
      const currentEvent = event;
      if (!currentEvent?.slug) return;
      const rsvpData = currentPayment?.booking?.rsvp || {};
      const statusDetails = currentPayment?.booking?.statusDetails || {};
      setPendingPayment(null);
      setShowRsvpForm(false);
      // A product purchase lands on its delivery, not the event success page.
      if (currentEvent.kind === "product") {
        const rsvpId = rsvpData?.id;
        navigate(`/p/${currentEvent.slug}${rsvpId ? `?purchase=${rsvpId}` : ""}`);
        return;
      }
      navigate(`/e/${currentEvent.slug}/success`, {
        state: {
          booking: {
            name: currentPayment?.booking?.name || rsvpData?.name || null,
            email: currentPayment?.booking?.email || rsvpData?.email || null,
            bookingStatus: "CONFIRMED",
            wantsDinner: statusDetails?.wantsDinner ?? rsvpData?.wantsDinner ?? false,
            partySize: rsvpData?.partySize || 1,
            plusOnes: rsvpData?.plusOnes || 0,
            dinnerPartySize: rsvpData?.dinnerPartySize || null,
            dinnerTimeSlot: rsvpData?.dinnerTimeSlot || null,
          },
          payment: {
            id: settled?.paymentId || null,
            status: "succeeded",
            amount: settled?.amount ?? currentPayment?.amount,
            currency: settled?.currency ?? currentPayment?.currency,
            paymentBreakdown: settled?.breakdown || currentPayment?.paymentBreakdown || null,
          },
        },
      });
    },
    [event, navigate, pendingPayment]
  );

  // Payments v2 → card: the charge endpoint returned a Stripe clientSecret.
  // Morph into the LEGACY pendingPayment shape so the existing Stripe Elements
  // form + webhook + verify flow take over unchanged.
  const handleV2StripeCharge = useCallback((charge) => {
    setPendingPayment((prev) => ({
      clientSecret: charge.instructions.clientSecret,
      amount: charge.amount,
      currency: charge.currency,
      paymentId: charge.paymentId,
      paymentBreakdown: charge.breakdown || prev?.paymentBreakdown || null,
      booking: prev?.booking || null,
    }));
  }, []);

  // Memoize PaymentFormComponent to prevent unnecessary remounts
  // MUST be called before any early returns to follow Rules of Hooks
  const PaymentFormComponent = useMemo(() => {
    if (!event || event?.ticketType !== "paid" || !event?.slug) {
      return null;
    }
    const eventSlug = event.slug; // Capture slug to avoid closure issues
    return ({
      clientSecret,
      amount,
      currency,
      onSuccess,
      onError,
      showButton,
    }) => (
      <PaymentForm
        clientSecret={clientSecret}
        amount={amount}
        currency={currency}
        eventSlug={eventSlug}
        onSuccess={pendingPayment ? handlePaymentSuccess : onSuccess}
        onError={onError}
        showButton={showButton}
      />
    );
  }, [event, pendingPayment, handlePaymentSuccess]);

  // Check if event has passed - MUST be called before any early returns to follow Rules of Hooks
  const isEventPast = useMemo(
    () => !!event && hasEventEnded(event.startsAt, event.endsAt),
    [event]
  );

  // Check if event is sold out (full capacity, no waitlist)
  const isSoldOut = useMemo(() => {
    if (!event || event.waitlistEnabled || event.instantWaitlist) return false;
    const spotsLeft = event._attendance?.cocktailSpotsLeft;
    return spotsLeft !== null && spotsLeft !== undefined && spotsLeft <= 0;
  }, [event]);

  // Standard PullUp dark guest theme.
  const backgroundColor = "#05040a";

  // Detect mobile file-sharing support (for "Add to Story" button)
  useEffect(() => {
    async function checkShareSupport() {
      if (!navigator.canShare) return;
      try {
        const testFile = new File([new Uint8Array(1)], "test.png", { type: "image/png" });
        if (navigator.canShare({ files: [testFile] })) {
          setCanShareStory(true);
        }
      } catch {
        // Not supported
      }
    }
    checkShareSupport();
  }, []);

  useEffect(() => {
    async function loadEvent() {
      setLoading(true);
      setNotFound(false);

      // Check for waitlist or VIP token first
      const waitlistQueryToken = searchParams.get("wl");
      const vipQueryToken = searchParams.get("vip");

      // Prefer waitlist token if both are present (they shouldn't be)
      const initialTokenType = waitlistQueryToken
        ? "waitlist"
        : vipQueryToken
          ? "vip"
          : null;
      const initialToken = waitlistQueryToken || vipQueryToken || null;

      if (initialToken && initialTokenType === "waitlist") {
        // If waitlist token exists, validate it first to get event info
        try {
          const offerRes = await publicFetch(
            `/events/${slug}/waitlist-offer?wl=${initialToken}`
          );
          if (offerRes.ok) {
            const offerData = await offerRes.json();
            // Token is valid - use event from token response directly
            if (offerData.event && offerData.event.id) {
              setEvent(offerData.event);
              setWaitlistOffer(offerData);
              setWaitlistToken(initialToken);
              setSearchParams({}, { replace: true });
              setLoading(false);
              return;
            }
          } else {
            const error = await offerRes.json().catch(() => ({}));
            console.error("Invalid waitlist token:", error);
            setSearchParams({}, { replace: true });
          }
        } catch (err) {
          console.error("Error validating waitlist token:", err);
          setSearchParams({}, { replace: true });
        }
      } else if (initialToken && initialTokenType === "vip") {
        // VIP token: validate to get event + invite info
        try {
          const offerRes = await publicFetch(
            `/events/${slug}/vip-offer?vip=${initialToken}`
          );
          if (offerRes.ok) {
            const offerData = await offerRes.json();
            if (offerData.event && offerData.event.id) {
              setEvent(offerData.event);
              setVipOffer(offerData);
              setVipToken(initialToken);
              setShowRsvpForm(true);
              setSearchParams({}, { replace: true });
              setLoading(false);
              return;
            }
          } else {
            const error = await offerRes.json().catch(() => ({}));
            console.error("Invalid VIP token:", error);
            setSearchParams({}, { replace: true });
          }
        } catch (err) {
          console.error("Error validating VIP token:", err);
          setSearchParams({}, { replace: true });
        }
      }

      // Normal event loading (no token or token validation failed)
      try {
        const res = await publicFetch(`/events/${slug}`);
        if (res.status === 404) {
          setNotFound(true);
          setEvent(null);
          return;
        }
        if (!res.ok) throw new Error("Failed to load event");
        const data = await res.json();
        // Debug: Log event structure to verify slug exists (dev-only)
        logger.debug("[EventPage] Loaded event", {
          id: data.id,
          slug: data.slug,
          title: data.title,
          hasImage: !!data.imageUrl,
        });
        if (!data.slug) {
          console.error("[EventPage] WARNING: Event missing slug!", data);
        }
        setEvent(data);

        // If we still have tokens in the URL and event loaded, validate now
        if (waitlistQueryToken) {
          try {
            const offerRes = await publicFetch(
              `/events/${slug}/waitlist-offer?wl=${waitlistQueryToken}`
            );
            if (offerRes.ok) {
              const offerData = await offerRes.json();
              setWaitlistOffer(offerData);
              setWaitlistToken(waitlistQueryToken);
              setSearchParams({}, { replace: true });
            } else {
              const error = await offerRes.json().catch(() => ({}));
              console.error("Invalid waitlist token:", error);
              setSearchParams({}, { replace: true });
            }
          } catch (err) {
            console.error("Error validating waitlist token:", err);
            setSearchParams({}, { replace: true });
          }
        } else if (vipQueryToken) {
          try {
            const offerRes = await publicFetch(
              `/events/${slug}/vip-offer?vip=${vipQueryToken}`
            );
            if (offerRes.ok) {
              const offerData = await offerRes.json();
              setVipOffer(offerData);
              setVipToken(vipQueryToken);
              setShowRsvpForm(true);
              setSearchParams({}, { replace: true });
            } else {
              const error = await offerRes.json().catch(() => ({}));
              console.error("Invalid VIP token:", error);
              setSearchParams({}, { replace: true });
            }
          } catch (err) {
            console.error("Error validating VIP token:", err);
            setSearchParams({}, { replace: true });
          }
        }
      } catch (err) {
        console.error("Error loading event", err);
        if (isNetworkError(err)) {
          handleNetworkError(err, showToast, "Failed to load event");
        }
      } finally {
        setLoading(false);
      }
    }

    if (slug) loadEvent();
  }, [slug, searchParams, setSearchParams, showToast]);

  // Track page view (fire-and-forget, never blocks rendering)
  useEffect(() => {
    if (!event?.id || !slug) return;
    try {
      // Get or create a persistent visitor ID
      let visitorId = localStorage.getItem("pullup_visitor_id");
      if (!visitorId) {
        visitorId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem("pullup_visitor_id", visitorId);
      }

      // Parse UTM params from the current URL
      const params = new URLSearchParams(window.location.search);
      const isMobile = window.innerWidth < 768;

      publicFetch(`/events/${slug}/view`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitorId,
          referrer: document.referrer || null,
          utm_source: params.get("utm_source") || null,
          utm_medium: params.get("utm_medium") || null,
          utm_campaign: params.get("utm_campaign") || null,
          utm_content: params.get("utm_content") || null,
          deviceType: isMobile ? "mobile" : "desktop",
          userAgent: navigator.userAgent || null,
          isVip: !!vipToken,
        }),
      }).catch(() => {}); // Silently ignore tracking failures
    } catch {
      // Never let tracking break the page
    }
  }, [event?.id, slug, vipToken]);

  if (loading) {
    return <EventPageSkeleton />;
  }

  if (notFound || !event) {
    return (
      <div
        style={{
          minHeight: "100vh",
          position: "relative",
          background:
            `${colors.gradientGlow}, ${colors.background}`,
          padding: "40px 16px",
        }}
      >
        <div className="responsive-container responsive-container-wide">
          <div
            className="responsive-card"
            style={{
              background: "rgba(12, 10, 18, 0.6)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.05)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "18px", opacity: 0.8 }}>
              Event not found.
            </div>
          </div>
        </div>
      </div>
    );
  }

  async function handleRsvpSubmit(data) {
    setRsvpLoading(true);
    const submittedData = data; // Store submitted data for later use
    try {
      // Include waitlist or VIP data if present
      let requestBody = { ...data };

      // Link browsing session to RSVP
      try {
        const vid = localStorage.getItem("pullup_visitor_id");
        if (vid) requestBody.visitorId = vid;
      } catch {}

      // Carry the entry-path params from the signup link (e.g. an Instagram
      // comment link: ?src=ig_comment&ig_ref=<commentId>&ig_uid=<igsid>) so the
      // backend can stamp how this person found us + bind their IG identity.
      try {
        const qp = new URLSearchParams(window.location.search);
        const src = qp.get("src");
        if (src) {
          requestBody.acquisitionSrc = src;
          if (qp.get("ig_ref")) requestBody.igRef = qp.get("ig_ref");
          if (qp.get("ig_uid")) requestBody.igUid = qp.get("ig_uid");
        }
      } catch {}

      if (waitlistOffer && waitlistOffer.rsvpDetails && waitlistToken) {
        requestBody = {
          ...requestBody,
          waitlistRsvpId: waitlistOffer.rsvpDetails.id,
          waitlistToken: waitlistToken,
        };
      } else if (vipOffer && vipOffer.invite && vipToken) {
        requestBody = {
          ...requestBody,
          vipToken,
        };
      }

      const res = await publicFetch(`/events/${event.slug}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));

        if (res.status === 409 && err.error === "full") {
          return { error: "This event is sold out — no more spots available." };
        }

        if (res.status === 409 && err.error === "capacity_exceeded") {
          return { error: "capacity_exceeded", capacityExceeded: true };
        }

        if (res.status === 409 && err.error === "duplicate") {
          // Already in — that's a fact, not a failure. The gate stays at
          // submit (no pre-check oracle), but it answers kindly and in the
          // page's own language: member of a community vs spot at an event.
          const existingRsvp = err.rsvp || {};
          const partySize = existingRsvp.partySize || 1;
          const isWaitlisted = err.status === "waitlist" || existingRsvp.bookingStatus === "WAITLIST";
          const isCommunity = (event?.kind || "event") === "community";
          return {
            alreadyIn: true,
            message: isCommunity
              ? "You're already a member — nothing to do. Same link, same you."
              : isWaitlisted
                ? "You're already on the waitlist for this event — hold tight."
                : `You already have a spot at this event${partySize > 1 ? ` (${partySize} people)` : ""}. Need changes? Message the host.`,
          };
        }

        // Handle payment errors specifically
        if (res.status === 500 && err.error === "payment_failed") {
          console.error("Payment creation error:", err.details || err.message);
          return { error: "Payment setup failed. Please try again or contact the host." };
        }

        return { error: err.message || err.error || "Something went wrong. Please try again." };
      }

      const body = await res.json();

      // Payments v2 (rail-agnostic checkout): the RSVP is PENDING_PAYMENT and
      // the backend offered rails (Swish / M-Pesa / card / mock). Keep the
      // modal open and hand off to the V2CheckoutPanel; settlement is polled
      // and onV2Success navigates. A card pick morphs into the legacy Stripe
      // pendingPayment shape via onV2StripeCharge.
      if (body.paymentV2?.required) {
        setPendingPayment({
          v2: body.paymentV2,
          amount: body.paymentV2.amount,
          currency: body.paymentV2.currency,
          paymentBreakdown: body.paymentV2.breakdown || null,
          booking: {
            name: body.rsvp?.name || submittedData?.name || null,
            email: body.rsvp?.email || submittedData?.email || null,
            rsvp: body.rsvp,
            event: body.event,
            statusDetails: body.statusDetails || null,
          },
        });
        return true;
      }

      // If this is a paid event and payment is required, store payment info
      // and let the inline PaymentForm handle confirmation with Stripe.
      if (body.stripe?.clientSecret && body.payment) {
        setPendingPayment({
          clientSecret: body.stripe.clientSecret,
          amount: body.payment.amount, // Customer total (ticket + service fee)
          currency: body.payment.currency || "usd",
          paymentId: body.stripe.paymentId,
          paymentBreakdown: body.paymentBreakdown || null, // Fee breakdown for display
          booking: {
            name: body.rsvp?.name || submittedData?.name || null,
            email: body.rsvp?.email || submittedData?.email || null,
            rsvp: body.rsvp,
            event: body.event,
            statusDetails: body.statusDetails || null, // Include statusDetails for dinner info
          },
        });
        // Keep RSVP modal open with payment section active
        return true;
      }

      // Handle different status scenarios with appropriate messages
      const statusDetails = body.statusDetails || {
        bookingStatus:
          body.rsvp?.bookingStatus ||
          (body.rsvp?.status === "attending" ? "CONFIRMED" : "WAITLIST"),
        dinnerBookingStatus:
          body.rsvp?.dinner?.bookingStatus ||
          (body.rsvp?.dinnerStatus === "confirmed"
            ? "CONFIRMED"
            : body.rsvp?.dinnerStatus === "waitlist"
            ? "WAITLIST"
            : null),
        wantsDinner:
          body.rsvp?.dinner?.enabled || body.rsvp?.wantsDinner || false,
        // Backward compatibility
        cocktailStatus: body.rsvp?.status || "attending",
        dinnerStatus: body.rsvp?.dinnerStatus || null,
      };

      const bookingStatus =
        statusDetails.bookingStatus ||
        (statusDetails.cocktailStatus === "attending"
          ? "CONFIRMED"
          : "WAITLIST");
      const dinnerBookingStatus =
        statusDetails.dinnerBookingStatus ||
        (statusDetails.dinnerStatus === "confirmed"
          ? "CONFIRMED"
          : statusDetails.dinnerStatus === "waitlist"
          ? "WAITLIST"
          : null);
      const wantsDinner = statusDetails.wantsDinner;

      // Build appropriate message based on status
      let message = "";
      let subtext = "";
      let toastType = "success";

      if (bookingStatus === "WAITLIST") {
        // Entire booking is on waitlist (all-or-nothing)
        message = "You're on the list";
        toastType = "info";

        if (event?.instantWaitlist) {
          subtext = "The host will confirm your spot.";
        } else if (wantsDinner && dinnerBookingStatus === "WAITLIST") {
          subtext =
            "Dinner is full right now. The host will reach out if a table opens.";
        } else {
          subtext =
            "The event is full right now. The host will reach out if a spot opens.";
        }
      } else if (bookingStatus === "CONFIRMED") {
        // Fully confirmed
        message = "You're in!";
        if (wantsDinner && dinnerBookingStatus === "CONFIRMED") {
          subtext = "Your dinner time is confirmed. Check the details above.";
        }
      }

      // Close RSVP form
      setShowRsvpForm(false);

      // The Room is the success now. Both a CONFIRMED spot and a WAITLIST spot
      // are "in" before the event — they route straight into the event Room
      // (confirmed → the lobby; waitlist → the lower-key peek the host configures).
      // (Paid RSVPs never reach here; they return via Stripe to the success page,
      // which forwards both states on to the room.)
      const goToRoom = (bookingStatus === "CONFIRMED" || bookingStatus === "WAITLIST") && !!event?.id;
      setTimeout(() => {
        if (goToRoom) {
          // A logged-out guest lands on the room and authenticates through the
          // AuthGate — access resolves off a verified session, never a stored
          // email (see the killed ?email= bypass). No client-side identity stash.
          // Community joins belong in the host's MAIN room — there is no
          // per-event moment to gather around; the membership IS the room.
          const mainRoom = (event?.kind || "event") !== "event" && event?.hostId;
          navigate(mainRoom ? `/r/${event.hostId}` : `/events/${event.id}/room`);
          return;
        }
        navigate(`/e/${event.slug}/success`, {
          state: {
            booking: {
              name: body.rsvp?.name || submittedData?.name || null,
              email: body.rsvp?.email || submittedData?.email || null,
              bookingStatus: bookingStatus,
              dinnerBookingStatus: dinnerBookingStatus,
              wantsDinner: wantsDinner,
              partySize:
                body.rsvp?.partySize ||
                (submittedData?.plusOnes ? 1 + submittedData.plusOnes : 1),
              plusOnes: body.rsvp?.plusOnes || submittedData?.plusOnes || 0,
              dinnerPartySize:
                body.rsvp?.dinnerPartySize ||
                body.rsvp?.dinner?.partySize ||
                submittedData?.dinnerPartySize ||
                null,
              dinnerTimeSlot:
                body.rsvp?.dinnerTimeSlot ||
                body.rsvp?.dinner?.slotTime ||
                submittedData?.dinnerTimeSlot ||
                null,
              statusDetails: statusDetails,
            },
          },
        });
      }, 1000);

      return true; // Success
    } catch (err) {
      console.error(err);
      if (isNetworkError(err)) {
        handleNetworkError(err, showToast, "Network error. Please try again.");
      } else {
        console.error("RSVP error:", err.message || err);
      }
      return false;
    } finally {
      setRsvpLoading(false);
    }
  }

  // Use share URL for better link previews (returns HTML with OG tags)
  const shareUrl = event && event.slug ? getEventShareUrl(event.slug) : "";

  // Determine share mode based on media settings
  const isAutoCarousel = event?.mediaSettings?.autoscroll && event?.media?.length > 1;
  const isManualCarousel = !event?.mediaSettings?.autoscroll && event?.media?.length > 1;
  const carouselInterval = event?.mediaSettings?.interval || 5;

  // Generate a video from carousel images by drawing each on a canvas at the set interval
  async function createCarouselVideo(mediaItems, intervalSec) {
    const size = 1080; // Story-friendly square
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    // Pre-load all images
    const images = await Promise.all(
      mediaItems.map(
        (m) =>
          new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = m.url;
          })
      )
    );
    const validImages = images.filter(Boolean);
    if (validImages.length === 0) return null;

    // Record the canvas as video
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported("video/mp4")
        ? "video/mp4"
        : "video/webm",
    });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    const done = new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));
    });

    recorder.start();

    // Draw each image for intervalSec, looping once through all images
    for (const img of validImages) {
      // Cover-fit the image into the square canvas
      const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      await new Promise((r) => setTimeout(r, intervalSec * 1000));
    }

    recorder.stop();
    return done;
  }

  // Build file(s) to share based on media type
  async function buildShareFiles() {
    if (!event) return [];

    // Single video → share the video directly
    if (event.media?.length === 1 && event.media[0].mediaType === "video") {
      const res = await fetch(event.media[0].url);
      const blob = await res.blob();
      return [new File([blob], `${event.title || "event"}.mp4`, { type: blob.type || "video/mp4" })];
    }

    // Auto-scroll carousel → generate a video from the images
    if (isAutoCarousel) {
      const blob = await createCarouselVideo(event.media, carouselInterval);
      if (blob) {
        const ext = blob.type.includes("mp4") ? "mp4" : "webm";
        return [new File([blob], `${event.title || "event"}.${ext}`, { type: blob.type })];
      }
    }

    // Manual carousel with picker → share only selected images
    if (isManualCarousel && selectedShareIndexes.size > 0) {
      const selected = event.media.filter((_, i) => selectedShareIndexes.has(i));
      return Promise.all(
        selected.map(async (m, i) => {
          const res = await fetch(m.url);
          const blob = await res.blob();
          const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
          return new File([blob], `${event.title || "event"}-${i + 1}.${ext}`, { type: blob.type || "image/jpeg" });
        })
      );
    }

    // Single image or cover fallback
    const url = event.coverImageUrl || event.imageUrl || event.media?.[0]?.url;
    if (!url) return [];
    const res = await fetch(url);
    const blob = await res.blob();
    const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
    return [new File([blob], `${event.title || "event"}.${ext}`, { type: blob.type || "image/jpeg" })];
  }

  // Lapsed-host degradation: backend says sign-ups are paused (page stays up).
  const rsvpsPaused = !!event?.rsvpsPaused;

  const isDisabled = loading || !event || isEventPast || isSoldOut || rsvpsPaused;

  return (
    <>
      <style>{`
        body, html { overflow: hidden; height: 100vh; height: 100dvh; width: 100%; }
        @supports (height: 100dvh) { body, html { height: 100dvh; } }
        * { box-sizing: border-box; }
      `}</style>
      <div
        className="brand-scope"
        style={{
          width: "100%",
          height: "100dvh",
          overflow: "hidden",
          background: backgroundColor,
          color: "#fff",
        }}
      >
        {(() => {
          const renderRsvp = !isDisabled
            ? ({ onClose }) => (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* Waitlist offer banner */}
                  {waitlistOffer && (
                    <div style={{
                      padding: "16px",
                      background: "rgba(59, 130, 246, 0.1)",
                      border: "1px solid rgba(59, 130, 246, 0.3)",
                      borderRadius: "8px",
                      marginBottom: "8px",
                    }}>
                      <div style={{ fontSize: "16px", fontWeight: 600, color: "#3b82f6", marginBottom: "8px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                          <SilverIcon as={PartyPopper} size={20} style={{ color: "#3b82f6" }} />
                          You've got a spot!
                        </span>
                      </div>
                      <div style={{ fontSize: "14px", opacity: 0.9 }}>
                        Your booking details are locked based on your original
                        waitlist request. Complete payment below to confirm your spot.
                      </div>
                    </div>
                  )}
                  <RsvpForm
                    event={event}
                    onSubmit={handleRsvpSubmit}
                    loading={rsvpLoading}
                    onClose={() => {
                      onClose();
                      setPendingPayment(null);
                      setWaitlistOffer(null);
                      setWaitlistToken(null);
                      setVipOffer(null);
                      setVipToken(null);
                    }}
                    onPartySizeChange={setCurrentPartySize}
                    waitlistOffer={waitlistOffer}
                    waitlistToken={waitlistToken}
                    vipOffer={vipOffer}
                    vipToken={vipToken}
                    isPaidEvent={event?.ticketType === "paid"}
                    ticketPrice={event?.ticketPrice}
                    ticketCurrency={(event?.ticketCurrency || "usd").toLowerCase()}
                    currentPartySize={currentPartySize}
                    pendingPayment={pendingPayment}
                    PaymentFormComponent={PaymentFormComponent}
                    onV2StripeCharge={handleV2StripeCharge}
                    onV2Success={handleV2Success}
                  />
                </div>
              )
            : null;

          const sharedProps = {
            title: event?.titleSettings?.visible !== false ? event?.title : null,
            description: event?.description,
            location: event?.location,
            locationLat: event?.locationLat,
            locationLng: event?.locationLng,
            showCoordinates: event?.showCoordinates,
            startsAt: event?.startsAt,
            endsAt: event?.endsAt,
            timezone: event?.timezone,
            media: event?.media,
            mediaSettings: event?.mediaSettings,
            imagePreview: event?.imageUrl,
            ticketType: event?.ticketType || "free",
            ticketPrice: event?.ticketPrice,
            ticketCurrency: event?.ticketCurrency,
            isEventPast,
            isSoldOut,
            rsvpsPaused,
            instagram: event?.instagram,
            spotify: event?.spotify,
            tiktok: event?.tiktok,
            soundcloud: event?.soundcloud,
            sections: event?.sections || [],
            design: event?.scene || null,
            hideLocation: event?.hideLocation,
            hideDate: event?.hideDate,
            revealHint: event?.revealHint,
            dateRevealHint: event?.dateRevealHint,
            instantWaitlist: event?.instantWaitlist,
            autoShowRsvp: !!vipOffer || !!waitlistOffer,
            rsvpContent: renderRsvp,
            // Page kind — drives the CTA label (community → "Join"). Date/place
            // are already hidden via the row's hide_date/hide_location flags.
            kind: event?.kind || "event",
            // Host control over the on-page sign-up surface (mig 096).
            hideSignup: !!event?.signupSettings?.hidden,
            signupLabel: event?.signupSettings?.label || null,
            signupCta: event?.signupSettings?.cta || null,
            // Product pages: sanitized delivery summary + the buyer's rsvpId
            // (from ?purchase=, set by the success redirect / confirmation email).
            productDelivery: event?.productDelivery || null,
            purchaseRsvpId: searchParams.get("purchase") || null,
          };

          return isDesktop
            ? <DesktopEventLayout {...sharedProps} />
            : <EventPreview {...sharedProps} />;
        })()}

        {/* Share picker for manual carousels */}
        <ModalOrDrawer
          isOpen={showSharePicker}
          onClose={() => setShowSharePicker(false)}
          title="Share to Story"
        >
          <div style={{ padding: "16px" }}>
            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px", marginBottom: "16px" }}>
              Select the images you want to share
            </p>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "8px",
              marginBottom: "20px",
            }}>
              {event?.media?.map((m, i) => (
                <button
                  key={m.id || i}
                  type="button"
                  onClick={() => {
                    setSelectedShareIndexes((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    });
                  }}
                  style={{
                    position: "relative",
                    aspectRatio: "1",
                    border: selectedShareIndexes.has(i) ? "3px solid #fff" : "3px solid transparent",
                    borderRadius: "12px",
                    overflow: "hidden",
                    padding: 0,
                    background: "#1a1a2e",
                    cursor: "pointer",
                    opacity: selectedShareIndexes.size > 0 && !selectedShareIndexes.has(i) ? 0.5 : 1,
                    transition: "all 0.2s ease",
                  }}
                >
                  <img src={transformedImageUrl(m.thumbnailUrl || m.url, { width: 200 })} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  {selectedShareIndexes.has(i) && (
                    <div style={{
                      position: "absolute", top: "6px", right: "6px",
                      width: "24px", height: "24px", borderRadius: "50%", background: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
            <button
              disabled={selectedShareIndexes.size === 0}
              onClick={async () => {
                setShowSharePicker(false);
                try {
                  const files = await buildShareFiles();
                  if (files.length > 0 && navigator.share) {
                    await navigator.share({ files, url: shareUrl });
                  }
                } catch (err) {
                  if (err?.name === "AbortError") return;
                  console.error("Error sharing:", err);
                  showToast("Couldn't share", "error");
                }
              }}
              style={{
                width: "100%", padding: "16px", borderRadius: "14px", border: "none",
                background: selectedShareIndexes.size > 0 ? "linear-gradient(135deg, #f0f0f0 0%, #c0c0c0 50%, #a8a8a8 100%)" : "#333",
                color: "#fff", fontWeight: 700, fontSize: "16px",
                cursor: selectedShareIndexes.size > 0 ? "pointer" : "not-allowed",
                opacity: selectedShareIndexes.size > 0 ? 1 : 0.5,
                transition: "all 0.2s ease",
              }}
            >
              Share {selectedShareIndexes.size > 0 ? `${selectedShareIndexes.size} image${selectedShareIndexes.size > 1 ? "s" : ""}` : ""}
            </button>
          </div>
        </ModalOrDrawer>
      </div>
    </>
  );
}
